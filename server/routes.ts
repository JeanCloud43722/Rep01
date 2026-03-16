import type { Express, RequestHandler } from "express";
import { createServer, type Server, type IncomingMessage } from "http";
import { readFileSync } from "fs";
import { storage } from "./storage";
import { getPool, getDb } from "./db";
import webPush from "web-push";
import schedule from "node-schedule";
import { pushSubscriptionSchema, adminUsers } from "@shared/schema";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { WebSocketServer, WebSocket } from "ws";
import { getConfig } from "./env-validation";
import { logger } from "./lib/logger";
import { sanitizeInput } from "./lib/sanitize";
import { ValidationError, canReactivate } from "./lib/state-machine";
import { requireAuth } from "./middleware/auth";
import { getReplySuggestion, getGuestAnswer } from "./lib/deepseek";
import { aiRateLimiter } from "./middleware/rate-limit";
import { retrieveRelevantChunks, getChunkCount } from "./lib/knowledge-base/retriever";
import { processKnowledgeBase } from "./lib/knowledge-base/processor";
import { webSearch } from "./lib/web-search";
import bcrypt from "bcryptjs";

const VERSION = (() => {
  try {
    return (JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string }).version;
  } catch {
    return "unknown";
  }
})();

// Extended WebSocket type with heartbeat tracking
interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  clientId?: string;
  orderId?: string;
  lastMessageTimestamp?: number;
}

// Heartbeat configuration
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 5000; // 5 seconds to respond

// Client session tracking for reconnection
const clientSessions = new Map<string, {
  orderId: string;
  lastMessageTimestamp: number;
  lastSeen: number;
}>();

function getVapidKeys() {
  const cfg = getConfig();
  let publicKey = cfg.vapidPublicKey;
  let privateKey = cfg.vapidPrivateKey;

  if (!publicKey || !privateKey) {
    const generated = webPush.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    logger.warn("Using ephemeral VAPID keys — push subscriptions will not survive restarts", { source: "vapid", hint: "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Replit Secrets" });
  } else {
    logger.info("Using persistent VAPID keys from environment", { source: "vapid" });
  }

  return { publicKey, privateKey };
}

const scheduledJobs = new Map<string, schedule.Job>();

// WebSocket client tracking per order
const orderSubscribers = new Map<string, Set<any>>();

// WebSocket client tracking for admin dashboard
const adminSubscribers = new Set<any>();

// Event types for differentiated notifications
type OrderEventType = "message" | "order_ready" | "service_request" | "offer" | "status_update" | "new_registration" | "order_completed";

async function sendSinglePushNotification(orderId: string, message?: string, notificationNumber: number = 1) {
  const order = await storage.getOrder(orderId);
  if (!order) {
    throw new Error("Order not found");
  }
  
  // Push notifications are optional - if no subscription, skip silently
  if (!order.subscription) {
    logger.debug("No push subscription, WebSocket only", { source: "push", orderId });
    return { success: false, revoked: false };
  }

  const payload = JSON.stringify({
    title: "Order Ready!",
    body: message || "Your order is ready for pickup!",
    url: `/order/${orderId}`
  });

  try {
    const notifType = notificationNumber > 1 ? `reminder ${notificationNumber}/3` : "notification";
    logger.info("Sending push notification", { source: "push", orderId, notifType });
    await webPush.sendNotification(
      {
        endpoint: order.subscription.endpoint,
        keys: {
          p256dh: order.subscription.keys.p256dh,
          auth: order.subscription.keys.auth
        }
      },
      payload
    );
    
    logger.info("Push notification sent", { source: "push", orderId, notifType });
    return { success: true, revoked: false };
  } catch (error) {
    const err = error as any;
    const statusCode = err.statusCode || err.status;
    
    // HTTP 404/410: subscription revoked — delete and stop retrying
    if (statusCode === 404 || statusCode === 410) {
      logger.warn("Subscription removed (user revoked permission)", { source: "push", orderId, statusCode });
      // Delete the revoked subscription
      await storage.updateOrderSubscription(orderId, null as any);
      return { success: false, revoked: true };
    }
    
    // Other errors: log and allow retry
    logger.error("Push notification failed", { source: "push", orderId, error: err.message, statusCode });
    return { success: false, revoked: false };
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendNotificationWithRetry(orderId: string, message?: string, maxAttempts: number = 3) {
  const delays = [0, 2000, 4000];
  
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) {
      await sleep(delays[i] || 4000);
    }
    
    const result = await sendSinglePushNotification(orderId, message, i + 1);
    
    if (result.success) {
      logger.info("Push delivered", { source: "push", orderId, attempt: i + 1 });
      return true;
    }
    
    if (result.revoked) {
      logger.info("Aborting push retries (subscription revoked)", { source: "push", orderId });
      return false;
    }
  }
  
  logger.warn("All push attempts failed", { source: "push", orderId });
  return false;
}

async function sendNotification(orderId: string, message?: string) {
  const order = await storage.getOrder(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  // Add message to order history
  const notificationText = message || "Your order is ready for pickup!";
  await storage.addMessage(orderId, notificationText, "staff");
  
  // Mark as notified
  await storage.markOrderNotified(orderId);
  
  // Always notify WebSocket subscribers (works on all devices including iOS)
  notifyOrderUpdate(orderId, "order_ready");
  notifyAdminUpdate(orderId, "order_ready");
  logger.info("WebSocket order_ready notification sent", { source: "ws", orderId });
  
  // Try to send push notifications if subscription exists (optional, best-effort)
  // Fire-and-forget the entire retry chain
  if (order.subscription) {
    sendNotificationWithRetry(orderId, message, 3).catch(() => {});
  }
  
  return true;
}

function scheduleNotification(orderId: string, scheduledDate: Date, message?: string) {
  const job = schedule.scheduleJob(scheduledDate, async () => {
    try {
      logger.info("Scheduled notification firing", { source: "schedule", orderId, firedAt: new Date().toISOString() });
      await sendNotification(orderId, message);
      scheduledJobs.delete(orderId);
    } catch (error) {
      logger.error("Scheduled notification failed", { source: "schedule", orderId, error: (error as Error).message });
    }
  });
  
  if (job) {
    logger.info("Notification scheduled", { source: "schedule", orderId, scheduledAt: scheduledDate.toISOString() });
    scheduledJobs.set(orderId, job);
  } else {
    logger.warn("Failed to schedule notification", { source: "schedule", orderId, scheduledAt: scheduledDate.toISOString() });
  }
  
  return job;
}

function notifyOrderUpdate(orderId: string, eventType: OrderEventType = "status_update") {
  const subscribers = orderSubscribers.get(orderId);
  if (subscribers) {
    const message = JSON.stringify({ type: "order_updated", eventType, orderId });
    subscribers.forEach((ws) => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(message);
      }
    });
  }
}

function notifyAdminUpdate(orderId: string, eventType: OrderEventType) {
  const message = JSON.stringify({ type: "admin_update", eventType, orderId });
  adminSubscribers.forEach((ws) => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(message);
    }
  });
}

async function restoreScheduledNotifications() {
  try {
    logger.info("Restoring scheduled notifications from DB", { source: "startup" });
    const orders = await storage.getAllOrders();
    let restoredCount = 0;
    
    for (const order of orders) {
      if (order.scheduledTime && order.status === "scheduled") {
        const scheduledDate = new Date(order.scheduledTime);
        const now = new Date();
        
        if (scheduledDate > now) {
          // Schedule the notification if it hasn't fired yet
          scheduleNotification(order.id, scheduledDate);
          restoredCount++;
        }
      }
    }
    
    logger.info("Scheduled notifications restored", { source: "startup", restoredCount });
  } catch (error) {
    logger.error("Failed to restore scheduled notifications", { source: "startup", error: (error as Error).message });
  }
}

async function createDefaultAdmin(): Promise<void> {
  try {
    const db = getDb();
    const existing = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
    if (existing.length > 0) return;
    const hash = await bcrypt.hash("admin123", 12);
    await db.insert(adminUsers).values({ username: "admin", passwordHash: hash });
    logger.warn("Default admin created — CHANGE THE PASSWORD IMMEDIATELY", {
      source: "auth",
      username: "admin",
    });
  } catch (error) {
    logger.error("Failed to create default admin", { source: "auth", error: (error as Error).message });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  sessionMiddleware: RequestHandler
): Promise<Server> {
  // VAPID setup — must run after validateEnvironment() has been called
  const vapidKeys = getVapidKeys();
  webPush.setVapidDetails(
    "mailto:admin@bistro-buzzer.app",
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  // Both servers use noServer:true so we own the single upgrade handler.
  // ws 8.x calls abortHandshake(400) for non-matching paths, so two servers
  // sharing httpServer with different paths cannot coexist — the first server
  // kills sockets meant for the second before it can claim them.
  const wss = new WebSocketServer({ noServer: true });
  const adminWss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    const pathname = (req.url ?? "").split("?")[0];

    if (pathname === "/ws/orders") {
      wss.handleUpgrade(req, socket as any, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else if (pathname === "/ws/admin") {
      const fakeRes = {
        end: () => {},
        write: () => {},
        getHeader: () => undefined,
        setHeader: () => {},
        removeHeader: () => {},
        on: () => {},
      } as any;
      sessionMiddleware(req as any, fakeRes, () => {
        const sess = (req as any).session as { userId?: number } | undefined;
        if (!sess?.userId) {
          logger.warn("Unauthorized admin WebSocket upgrade rejected", { source: "ws" });
          adminWss.handleUpgrade(req, socket as any, head, (ws) => {
            ws.close(4001, "Unauthorized");
          });
          return;
        }
        adminWss.handleUpgrade(req, socket as any, head, (ws) => {
          adminWss.emit("connection", ws, req);
        });
      });
    }
    // Any other path (e.g., Vite HMR) is intentionally ignored — Vite
    // registers its own upgrade listener on the same httpServer.
  });

  // Restore scheduled notifications on startup
  await restoreScheduledNotifications();

  // Ensure at least one admin account exists
  await createDefaultAdmin();
  
  // Customer order WebSocket connections with heartbeat
  wss.on("connection", (ws: ExtendedWebSocket, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const orderId = url.searchParams.get("id");
    const clientId = url.searchParams.get("clientId");
    const lastTimestamp = url.searchParams.get("lastTimestamp");
    
    if (!orderId) {
      ws.close();
      return;
    }
    
    // Initialize heartbeat tracking
    ws.isAlive = true;
    ws.orderId = orderId;
    ws.clientId = clientId || undefined;
    ws.lastMessageTimestamp = lastTimestamp ? parseInt(lastTimestamp, 10) : Date.now();
    
    // Update client session if clientId provided
    if (clientId) {
      clientSessions.set(clientId, {
        orderId,
        lastMessageTimestamp: ws.lastMessageTimestamp,
        lastSeen: Date.now()
      });
      logger.info("WebSocket client reconnected", { source: "ws", clientId, orderId });
    }
    
    // Add this connection to the order's subscribers
    if (!orderSubscribers.has(orderId)) {
      orderSubscribers.set(orderId, new Set());
    }
    orderSubscribers.get(orderId)!.add(ws);
    
    // Send connection acknowledgment with server timestamp
    ws.send(JSON.stringify({
      type: "connected",
      orderId,
      serverTimestamp: Date.now(),
      clientId: clientId || `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }));
    
    // Handle pong responses for heartbeat
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    
    // Handle incoming messages (including pong responses as text)
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "pong") {
          ws.isAlive = true;
        } else if (message.type === "sync_request") {
          // Client is requesting missed messages since timestamp
          ws.lastMessageTimestamp = message.lastTimestamp || Date.now();
          // Send current order state
          storage.getOrder(orderId).then(order => {
            if (order) {
              ws.send(JSON.stringify({
                type: "sync_response",
                order,
                serverTimestamp: Date.now()
              }));
            }
          });
        }
      } catch (e) {
        // Ignore parse errors for binary pong frames
      }
    });
    
    ws.on("close", () => {
      const subscribers = orderSubscribers.get(orderId);
      if (subscribers) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
          orderSubscribers.delete(orderId);
        }
      }
      // Update last seen time for client session
      if (ws.clientId) {
        const session = clientSessions.get(ws.clientId);
        if (session) {
          session.lastSeen = Date.now();
        }
      }
    });
    
    ws.on("error", (error) => {
      logger.error("Customer WebSocket error", { source: "ws", orderId, error: error.message });
    });
  });
  
  // Heartbeat interval for customer connections
  const customerHeartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as ExtendedWebSocket;
      if (!extWs.isAlive) {
        logger.warn("Terminating unresponsive customer WebSocket", { source: "ws" });
        return extWs.terminate();
      }
      extWs.isAlive = false;
      // Send ping as JSON message (more reliable across platforms)
      try {
        extWs.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
      } catch (e) {
        // Connection may be closing
      }
    });
  }, HEARTBEAT_INTERVAL);
  
  wss.on("close", () => {
    clearInterval(customerHeartbeat);
  });
  
  // Admin dashboard WebSocket connections — auth already verified in upgrade handler
  adminWss.on("connection", (ws: ExtendedWebSocket) => {
    ws.isAlive = true;
    adminSubscribers.add(ws);
    logger.info("Admin WebSocket connected", { source: "ws" });

    ws.send(JSON.stringify({ type: "connected", serverTimestamp: Date.now() }));

    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "pong") ws.isAlive = true;
      } catch {
        // Ignore parse errors
      }
    });

    ws.on("close", () => {
      adminSubscribers.delete(ws);
      logger.info("Admin WebSocket disconnected", { source: "ws" });
    });

    ws.on("error", (error) => {
      logger.error("Admin WebSocket error", { source: "ws", error: error.message });
    });
  });
  
  // Heartbeat interval for admin connections
  const adminHeartbeat = setInterval(() => {
    adminWss.clients.forEach((ws) => {
      const extWs = ws as ExtendedWebSocket;
      if (!extWs.isAlive) {
        logger.warn("Terminating unresponsive admin WebSocket", { source: "ws" });
        return extWs.terminate();
      }
      extWs.isAlive = false;
      try {
        extWs.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
      } catch (e) {
        // Connection may be closing
      }
    });
  }, HEARTBEAT_INTERVAL);
  
  adminWss.on("close", () => {
    clearInterval(adminHeartbeat);
  });
  
  app.get("/api/health", async (_req, res) => {
    const dbStart = Date.now();
    let dbConnected = false;
    let dbResponseTimeMs = -1;
    try {
      await getPool().query("SELECT 1");
      dbConnected = true;
      dbResponseTimeMs = Date.now() - dbStart;
    } catch {
      dbResponseTimeMs = Date.now() - dbStart;
    }

    const customerWebSockets = wss.clients.size;
    const adminWebSockets = adminWss.clients.size;
    const allOrders = await storage.getAllOrders();
    const totalOrders = allOrders.length;
    const completedOrders = allOrders.filter(o => o.status === "completed").length;

    logger.debug("Health check", { source: "health", dbConnected, dbResponseTimeMs, customerWebSockets, adminWebSockets, totalOrders, completedOrders });

    res.json({
      status: dbConnected ? "ok" : "degraded",
      timestamp: Date.now(),
      uptime: process.uptime(),
      version: VERSION,
      database: { connected: dbConnected, responseTimeMs: dbResponseTimeMs },
      connections: { customerWebSockets, adminWebSockets },
      orders: { total: totalOrders, completed: completedOrders },
    });
  });

  // ── Auth endpoints (no requireAuth — these ARE the auth gate) ────────────────

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body as { username?: string; password?: string };
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      const db = getDb();
      const [user] = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.username, username))
        .limit(1);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      req.session.userId = user.id;
      req.session.username = user.username;
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      );
      logger.info("Admin login", { source: "auth", username: user.username });
      res.json({ ok: true, username: user.username });
    } catch (error) {
      logger.error("Login error", { source: "auth", error: (error as Error).message });
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const username = req.session.username;
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      logger.info("Admin logout", { source: "auth", username });
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json({ userId: req.session.userId, username: req.session.username });
  });

  // ── VAPID / public endpoints ──────────────────────────────────────────────

  app.get("/api/vapid-public-key", (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  const ordersQuerySchema = z.object({
    status: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(50),
    offset: z.coerce.number().min(0).default(0),
  });

  app.get("/api/orders", requireAuth, async (req, res) => {
    let query: { status?: string; limit: number; offset: number };
    try {
      query = ordersQuerySchema.parse(req.query);
    } catch (error) {
      res.status(400).json({ error: "Invalid query parameters", details: String(error) });
      return;
    }
    try {
      const statuses = query.status
        ? query.status.split(",").map(s => s.trim()).filter(Boolean)
        : undefined;
      const { orders, total } = await storage.getOrdersPaginated({
        statuses,
        limit: query.limit,
        offset: query.offset,
      });
      const result = orders.map(order => ({
        ...order,
        totalMessages: order.messages.length,
        messages: order.messages.slice(-20),
      }));
      res.json({ orders: result, total, limit: query.limit, offset: query.offset });
    } catch (error) {
      logger.error("Failed to fetch orders", { error });
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/:id", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  // Auto-register customer when they view the order page (no notification permission needed)
  app.post("/api/orders/:id/register", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Only auto-register if still in "waiting" status
      if (order.status === "waiting") {
        const updatedOrder = await storage.updateOrderStatus(req.params.id, "subscribed");
        // Notify admin that a new customer has registered
        notifyAdminUpdate(req.params.id, "new_registration");
        res.json(updatedOrder);
      } else {
        res.json(order);
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to register" });
    }
  });

  app.post("/api/orders", requireAuth, async (req, res) => {
    try {
      const order = await storage.createOrder();
      res.status(201).json(order);
    } catch (error) {
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  app.delete("/api/orders/:id", requireAuth, async (req, res) => {
    try {
      const job = scheduledJobs.get(req.params.id);
      if (job) {
        job.cancel();
        scheduledJobs.delete(req.params.id);
      }
      
      const deleted = await storage.deleteOrder(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete order" });
    }
  });

  app.post("/api/orders/:id/subscribe", async (req, res) => {
    try {
      const subscribeSchema = z.object({
        subscription: pushSubscriptionSchema
      });
      
      const { subscription } = subscribeSchema.parse(req.body);
      
      const order = await storage.updateOrderSubscription(req.params.id, subscription);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      // Notify admin immediately that push was enabled (status changed to "subscribed")
      notifyAdminUpdate(req.params.id, "status_update");
      res.json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid subscription data" });
      }
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to subscribe" });
    }
  });

  app.post("/api/orders/:id/trigger", requireAuth, async (req, res) => {
    try {
      const triggerSchema = z.object({
        message: z.string().max(500).optional()
      });
      const parsed = triggerSchema.parse(req.body ?? {});
      const message = parsed.message ? sanitizeInput(parsed.message) : undefined;
      await sendNotification(req.params.id, message);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      logger.error("Trigger notification error", { source: "api", orderId: req.params.id, error: (error as Error).message });
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  app.post("/api/orders/:id/message", requireAuth, async (req, res) => {
    try {
      const msgSchema = z.object({
        message: z.string().min(1).max(200),
        scheduledTime: z.string().optional()
      });
      
      const parsed = msgSchema.parse(req.body);
      const message = sanitizeInput(parsed.message);
      
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // If a scheduledTime is provided, handle combined message + schedule
      if (parsed.scheduledTime) {
        const scheduledDate = new Date(parsed.scheduledTime);
        if (scheduledDate <= new Date()) {
          return res.status(400).json({ error: "Scheduled time must be in the future" });
        }
        // Reactivate completed orders before scheduling
        let targetOrder = order;
        if (order.status === "completed") {
          const reactivated = await storage.reactivateOrder(req.params.id, { resetMessages: false });
          if (!reactivated) return res.status(404).json({ error: "Order not found" });
          targetOrder = reactivated;
          logger.info("Reactivated completed order via message+schedule", { source: "message", orderId: req.params.id });
        }
        // Cancel any existing scheduled job
        const existingJob = scheduledJobs.get(req.params.id);
        if (existingJob) existingJob.cancel();
        await storage.addMessage(req.params.id, message, "staff");
        await storage.updateOrderScheduledTime(req.params.id, parsed.scheduledTime);
        scheduleNotification(req.params.id, scheduledDate, message);
        notifyOrderUpdate(req.params.id, "status_update");
        notifyAdminUpdate(req.params.id, "status_update");
        logger.info("Staff message sent with scheduled follow-up", { source: "message", orderId: req.params.id, scheduledAt: scheduledDate.toISOString() });
        return res.json({ success: true, scheduled: true });
      }
      
      await storage.addMessage(req.params.id, message, "staff");
      
      // Always notify WebSocket subscribers (works on all devices including iOS)
      notifyOrderUpdate(req.params.id, "message");
      notifyAdminUpdate(req.params.id, "message");
      logger.info("Staff message sent via WebSocket", { source: "api", orderId: req.params.id });
      
      // Try to send push notifications if subscription exists (optional, best-effort)
      // Messages are less critical — use only 1 attempt
      if (order.subscription) {
        sendNotificationWithRetry(req.params.id, message, 1).catch(() => {});
      }
      
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid message" });
      }
      logger.error("Send message error", { source: "api", orderId: req.params.id, error: (error as Error).message });
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.post("/api/orders/:id/customer-message", async (req, res) => {
    try {
      const messageSchema = z.object({
        message: z.string().min(1).max(200)
      });
      
      const parsed = messageSchema.parse(req.body);
      const message = sanitizeInput(parsed.message);
      
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      await storage.addMessage(req.params.id, message, "customer");
      
      // Notify admin via WebSocket and also notify customer's own WebSocket for thread update
      notifyOrderUpdate(req.params.id, "message");
      notifyAdminUpdate(req.params.id, "message");
      logger.info("Customer message forwarded", { source: "api", orderId: req.params.id });
      
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid message" });
      }
      logger.error("Customer message error", { source: "api", orderId: req.params.id, error: (error as Error).message });
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.post("/api/orders/:id/schedule", requireAuth, async (req, res) => {
    try {
      const scheduleSchema = z.object({
        scheduledTime: z.string(),
        message: z.string().optional()
      });
      
      const { scheduledTime, message } = scheduleSchema.parse(req.body);
      
      // Cancel any existing job
      const existingJob = scheduledJobs.get(req.params.id);
      if (existingJob) {
        existingJob.cancel();
        logger.info("Cancelled previous scheduled job", { source: "schedule", orderId: req.params.id });
      }
      
      const scheduledDate = new Date(scheduledTime);
      const now = new Date();
      
      // Validate that scheduled time is in the future
      if (scheduledDate <= now) {
        return res.status(400).json({ error: "Scheduled time must be in the future" });
      }
      
      logger.info("Schedule request received", { source: "schedule", orderId: req.params.id, scheduledAt: scheduledDate.toISOString(), delaySecs: Math.round((scheduledDate.getTime() - now.getTime()) / 1000) });

      // Reactivate completed orders before scheduling
      const existing = await storage.getOrder(req.params.id);
      if (!existing) return res.status(404).json({ error: "Order not found" });
      if (existing.status === "completed") {
        await storage.reactivateOrder(req.params.id, { resetMessages: false });
        logger.info("Reactivated completed order for new scheduling", { source: "schedule", orderId: req.params.id });
      }
      
      const order = await storage.updateOrderScheduledTime(req.params.id, scheduledTime);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      scheduleNotification(req.params.id, scheduledDate, message);
      
      // Notify immediately so customer sees "Order In Progress" without waiting for polling
      notifyOrderUpdate(req.params.id, "status_update");
      notifyAdminUpdate(req.params.id, "status_update");
      
      res.json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid schedule data" });
      }
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to schedule notification" });
    }
  });

  app.post("/api/orders/:id/offers", requireAuth, async (req, res) => {
    try {
      const offerSchema = z.object({
        title: z.string().min(1),
        description: z.string().min(1)
      });
      
      const parsed = offerSchema.parse(req.body);
      const title = sanitizeInput(parsed.title);
      const description = sanitizeInput(parsed.description);
      
      const order = await storage.addOffer(req.params.id, title, description);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Notify WebSocket subscribers
      notifyOrderUpdate(req.params.id, "offer");
      notifyAdminUpdate(req.params.id, "offer");
      
      res.json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid offer data" });
      }
      res.status(500).json({ error: "Failed to add offer" });
    }
  });

  app.post("/api/orders/:id/service", async (req, res) => {
    try {
      const order = await storage.addServiceRequest(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Notify WebSocket subscribers - service_request for admin alert
      notifyOrderUpdate(req.params.id, "service_request");
      notifyAdminUpdate(req.params.id, "service_request");
      
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Failed to request service" });
    }
  });

  app.post("/api/orders/:id/service/:requestId/acknowledge", requireAuth, async (req, res) => {
    try {
      const { id, requestId } = req.params;
      const order = await storage.acknowledgeServiceRequest(id, requestId);
      if (!order) {
        return res.status(404).json({ error: "Order or service request not found" });
      }
      notifyOrderUpdate(id, "status_update");
      notifyAdminUpdate(id, "status_update");
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Failed to acknowledge service request" });
    }
  });

  app.post("/api/orders/:id/complete", requireAuth, async (req, res) => {
    try {
      const orderId = req.params.id;
      
      // Cancel any pending scheduled notification job
      const job = scheduledJobs.get(orderId);
      if (job) {
        job.cancel();
        scheduledJobs.delete(orderId);
        logger.info("Cancelled scheduled job for completed order", { source: "api", orderId });
      }
      
      // Mark order as completed
      const order = await storage.updateOrderStatus(orderId, "completed");
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Notify both customer and admin of completion
      notifyOrderUpdate(orderId, "order_completed");
      notifyAdminUpdate(orderId, "order_completed");
      
      logger.info("Order marked as completed", { source: "api", orderId });
      res.json(order);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      logger.error("Failed to complete order", { source: "api", orderId: req.params.id, error });
      res.status(500).json({ error: "Failed to complete order" });
    }
  });

  app.post("/api/orders/:id/reactivate", requireAuth, async (req, res) => {
    try {
      const reactivateSchema = z.object({
        resetMessages: z.boolean().optional().default(false)
      });

      const { resetMessages } = reactivateSchema.parse(req.body);

      const existing = await storage.getOrder(req.params.id);
      if (!existing) return res.status(404).json({ error: "Order not found" });
      if (!canReactivate(existing)) {
        return res.status(400).json({ error: `Order cannot be reactivated from status '${existing.status}'` });
      }

      // Cancel any lingering scheduled job
      const job = scheduledJobs.get(req.params.id);
      if (job) {
        job.cancel();
        scheduledJobs.delete(req.params.id);
      }

      const order = await storage.reactivateOrder(req.params.id, { resetMessages });
      if (!order) return res.status(404).json({ error: "Order not found" });

      notifyOrderUpdate(req.params.id, "order_reactivated");
      notifyAdminUpdate(req.params.id, "order_reactivated");

      logger.info("Order reactivated", { source: "api", orderId: req.params.id, reactivationCount: order.reactivationCount, resetMessages });
      res.json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid reactivation data" });
      }
      logger.error("Failed to reactivate order", { source: "api", orderId: req.params.id, error });
      res.status(500).json({ error: "Failed to reactivate order" });
    }
  });

  app.patch("/api/orders/:id/notes", requireAuth, async (req, res) => {
    try {
      const notesSchema = z.object({
        notes: z.string().max(500)
      });
      
      const parsed = notesSchema.parse(req.body);
      const notes = sanitizeInput(parsed.notes);
      
      const order = await storage.updateOrderNotes(req.params.id, notes);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Notify both customer and admin immediately
      notifyOrderUpdate(req.params.id, "status_update");
      notifyAdminUpdate(req.params.id, "status_update");
      
      res.json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid notes data" });
      }
      res.status(500).json({ error: "Failed to update notes" });
    }
  });

  // ── AI Reply Suggestion ──
  app.post("/api/ai/suggest-reply", requireAuth, aiRateLimiter, async (req, res) => {
    try {
      const bodySchema = z.object({
        orderId: z.string().min(1),
        messageHistory: z.array(z.object({
          id: z.string(),
          text: z.string(),
          sender: z.enum(["staff", "customer"]),
          sentAt: z.string(),
        })).min(1),
      });

      const { orderId, messageHistory } = bodySchema.parse(req.body);

      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      const config = getConfig();
      if (!config.deepseekApiKey) {
        return res.status(503).json({ error: "AI reply suggestions are not configured on this server." });
      }

      const suggestion = await getReplySuggestion(orderId, messageHistory);
      logger.info("AI suggestion served", { source: "ai", orderId });
      res.json({ suggestion });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request body" });
      }
      logger.error("AI suggestion error", { source: "ai", error: (error as Error).message });
      res.status(500).json({ error: "Failed to generate reply suggestion" });
    }
  });

  // ── AI Guest Assistant (public — requires valid orderId) ──
  app.post("/api/ai/guest-assistant", aiRateLimiter, async (req, res) => {
    try {
      const bodySchema = z.object({
        orderId: z.string().min(1).max(64),
        question: z.string().min(1).max(500),
      });

      const { orderId, question } = bodySchema.parse(req.body);

      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      const config = getConfig();
      if (!config.deepseekApiKey) {
        return res.status(503).json({ error: "AI guest assistant is not configured on this server." });
      }

      // Retrieve relevant knowledge base chunks
      const rawChunks = retrieveRelevantChunks(question, 5);
      const knowledgeChunks = rawChunks.map((r) => ({
        text: r.chunk.text,
        source: r.chunk.metadata.source,
        category: r.chunk.metadata.category,
      }));

      // Optional web search (only if keys are configured)
      let searchResults: Array<{ title: string; snippet: string; link: string }> = [];
      if (config.serpApiKey || (config.googleSearchApiKey && config.googleSearchEngineId)) {
        searchResults = await webSearch(question, 3);
      }

      const { answer, usedWebSearch } = await getGuestAnswer(question, knowledgeChunks, searchResults);

      // Build source citations
      const sources: Array<{
        type: "knowledge-base" | "web";
        title: string;
        excerpt: string;
        url?: string;
        category?: string;
      }> = [
        ...rawChunks.map((r) => ({
          type: "knowledge-base" as const,
          title: r.chunk.metadata.filename,
          excerpt: r.chunk.text.slice(0, 120) + (r.chunk.text.length > 120 ? "…" : ""),
          category: r.chunk.metadata.category,
        })),
        ...searchResults.map((r) => ({
          type: "web" as const,
          title: r.title,
          excerpt: r.snippet,
          url: r.link,
        })),
      ];

      logger.info("Guest assistant answered", {
        source: "guest-ai",
        orderId,
        kbChunks: knowledgeChunks.length,
        webResults: searchResults.length,
        usedWebSearch,
      });

      res.json({ answer, sources });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request body" });
      }
      logger.error("Guest assistant error", { source: "guest-ai", error: (error as Error).message });
      res.status(500).json({ error: "Failed to generate answer" });
    }
  });

  // ── Cleanup endpoint ──
  app.post("/api/orders/cleanup", requireAuth, async (req, res) => {
    try {
      const { maxAgeHours } = z.object({
        maxAgeHours: z.coerce.number().min(1).max(168).default(24)
      }).parse(req.body);

      const count = await storage.deleteCompletedOrdersOlderThan(maxAgeHours);
      logger.info("Admin cleanup: removed completed orders", { count, maxAgeHours, source: "cleanup" });

      notifyAdminUpdate("", "status_update");

      res.json({ deletedCount: count, maxAgeHours });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid cleanup parameters" });
      }
      res.status(500).json({ error: "Cleanup failed" });
    }
  });

  // ── Knowledge base: process documents on startup (background) ──
  processKnowledgeBase().catch((err) =>
    logger.warn("Knowledge base processing error", { source: "kb", err: String(err) })
  );

  // ── Automatic cleanup interval (every hour) ──
  setInterval(async () => {
    try {
      const count = await storage.deleteCompletedOrdersOlderThan(24);
      if (count > 0) {
        logger.info("Auto-cleanup: removed completed orders", { count, maxAgeHours: 24, source: "cleanup" });
      }
    } catch (error) {
      logger.warn("Auto-cleanup failed", { error: String(error), source: "cleanup" });
    }
  }, 3600000); // 1 hour

  return httpServer;
}
