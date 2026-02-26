import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import webPush from "web-push";
import schedule from "node-schedule";
import { pushSubscriptionSchema } from "@shared/schema";
import { z } from "zod";
import { WebSocketServer, WebSocket } from "ws";

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
  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;
  
  if (!publicKey || !privateKey) {
    const generated = webPush.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    console.log("Generated new VAPID keys. For production, set these as environment variables:");
    console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
    console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
  }
  
  return { publicKey, privateKey };
}

const vapidKeys = getVapidKeys();

webPush.setVapidDetails(
  "mailto:admin@restaurant-buzzer.local",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

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
    console.log(`[Notification] No push subscription for order ${orderId}, using WebSocket only`);
    return false;
  }

  const payload = JSON.stringify({
    title: "Order Ready!",
    body: message || "Your order is ready for pickup!",
    url: `/order/${orderId}`
  });

  try {
    const notifType = notificationNumber > 1 ? `reminder ${notificationNumber}/3` : "notification";
    console.log(`[Notification] Sending push ${notifType} to order ${orderId}`);
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
    
    console.log(`[Notification] Successfully sent push ${notifType} to order ${orderId}`);
    return true;
  } catch (error) {
    console.error(`[Notification] Failed to send push notification to order ${orderId}:`, error);
    return false;
  }
}

async function sendNotification(orderId: string, message?: string) {
  const order = await storage.getOrder(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  // Add message to order history
  const notificationText = message || "Your order is ready for pickup!";
  await storage.addMessage(orderId, notificationText);
  
  // Mark as notified
  await storage.markOrderNotified(orderId);
  
  // Always notify WebSocket subscribers (works on all devices including iOS)
  notifyOrderUpdate(orderId, "order_ready");
  notifyAdminUpdate(orderId, "order_ready");
  console.log(`[Notification] WebSocket notification sent for order ${orderId}`);
  
  // Try to send push notifications if subscription exists (optional, best-effort)
  if (order.subscription) {
    // Send first push notification immediately
    sendSinglePushNotification(orderId, message, 1).catch(() => {});
    
    // Send 2nd push notification after 2 seconds
    setTimeout(() => {
      sendSinglePushNotification(orderId, message, 2).catch(() => {});
    }, 2000);
    
    // Send 3rd push notification after 4 seconds
    setTimeout(() => {
      sendSinglePushNotification(orderId, message, 3).catch(() => {});
    }, 4000);
  }
  
  return true;
}

function scheduleNotification(orderId: string, scheduledDate: Date, message?: string) {
  const job = schedule.scheduleJob(scheduledDate, async () => {
    try {
      console.log(`[Schedule] Scheduled notification firing for order ${orderId} at ${new Date().toISOString()}`);
      await sendNotification(orderId, message);
      scheduledJobs.delete(orderId);
    } catch (error) {
      console.error(`[Schedule] Scheduled notification failed for order ${orderId}:`, error);
    }
  });
  
  if (job) {
    console.log(`[Schedule] Notification scheduled for order ${orderId} at ${scheduledDate.toISOString()}`);
    scheduledJobs.set(orderId, job);
  } else {
    console.warn(`[Schedule] Failed to schedule notification for order ${orderId} at ${scheduledDate.toISOString()}`);
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
    console.log("[Startup] Restoring scheduled notifications...");
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
    
    console.log(`[Startup] Restored ${restoredCount} scheduled notifications`);
  } catch (error) {
    console.error("[Startup] Failed to restore scheduled notifications:", error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/orders" });
  const adminWss = new WebSocketServer({ server: httpServer, path: "/ws/admin" });
  
  // Restore scheduled notifications on startup
  await restoreScheduledNotifications();
  
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
      console.log(`[WebSocket] Client ${clientId} reconnected for order ${orderId}`);
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
      console.error(`[WebSocket] Error for order ${orderId}:`, error.message);
    });
  });
  
  // Heartbeat interval for customer connections
  const customerHeartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as ExtendedWebSocket;
      if (!extWs.isAlive) {
        console.log(`[WebSocket] Terminating unresponsive customer connection`);
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
  
  // Admin dashboard WebSocket connections with heartbeat
  adminWss.on("connection", (ws: ExtendedWebSocket) => {
    ws.isAlive = true;
    adminSubscribers.add(ws);
    console.log("[WebSocket] Admin client connected");
    
    // Send connection acknowledgment
    ws.send(JSON.stringify({
      type: "connected",
      serverTimestamp: Date.now()
    }));
    
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "pong") {
          ws.isAlive = true;
        }
      } catch (e) {
        // Ignore parse errors
      }
    });
    
    ws.on("close", () => {
      adminSubscribers.delete(ws);
      console.log("[WebSocket] Admin client disconnected");
    });
    
    ws.on("error", (error) => {
      console.error("[WebSocket] Admin error:", error.message);
    });
  });
  
  // Heartbeat interval for admin connections
  const adminHeartbeat = setInterval(() => {
    adminWss.clients.forEach((ws) => {
      const extWs = ws as ExtendedWebSocket;
      if (!extWs.isAlive) {
        console.log(`[WebSocket] Terminating unresponsive admin connection`);
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
  
  app.get("/api/vapid-public-key", (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  app.get("/api/orders", async (req, res) => {
    try {
      const orders = await storage.getAllOrders();
      res.json(orders);
    } catch (error) {
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
      res.status(500).json({ error: "Failed to register" });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const order = await storage.createOrder();
      res.status(201).json(order);
    } catch (error) {
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  app.delete("/api/orders/:id", async (req, res) => {
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
      res.json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid subscription data" });
      }
      res.status(500).json({ error: "Failed to subscribe" });
    }
  });

  app.post("/api/orders/:id/trigger", async (req, res) => {
    try {
      const { message } = req.body || {};
      await sendNotification(req.params.id, message);
      res.json({ success: true });
    } catch (error) {
      console.error("Trigger error:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  app.post("/api/orders/:id/message", async (req, res) => {
    try {
      const messageSchema = z.object({
        message: z.string().min(1).max(200)
      });
      
      const { message } = messageSchema.parse(req.body);
      
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      await storage.addMessage(req.params.id, message);
      
      // Always notify WebSocket subscribers (works on all devices including iOS)
      notifyOrderUpdate(req.params.id, "message");
      notifyAdminUpdate(req.params.id, "message");
      console.log(`[Message] Sent message to order ${req.params.id}: ${message}`);
      
      // Try to send push notifications if subscription exists (optional, best-effort)
      if (order.subscription) {
        // Send first push notification immediately
        sendSinglePushNotification(req.params.id, message, 1).catch(() => {});
        
        // Send 2nd push notification after 2 seconds
        setTimeout(() => {
          sendSinglePushNotification(req.params.id, message, 2).catch(() => {});
        }, 2000);
        
        // Send 3rd push notification after 4 seconds
        setTimeout(() => {
          sendSinglePushNotification(req.params.id, message, 3).catch(() => {});
        }, 4000);
      }
      
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid message" });
      }
      console.error("Message error:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.post("/api/orders/:id/customer-message", async (req, res) => {
    try {
      const messageSchema = z.object({
        message: z.string().min(1).max(200)
      });
      
      const { message } = messageSchema.parse(req.body);
      
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      await storage.addMessage(req.params.id, message);
      
      // Notify admin via WebSocket
      notifyAdminUpdate(req.params.id, "message");
      console.log(`[Message] Customer sent message to order ${req.params.id}: ${message}`);
      
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid message" });
      }
      console.error("Customer message error:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.post("/api/orders/:id/schedule", async (req, res) => {
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
        console.log(`[Schedule] Cancelled previous job for order ${req.params.id}`);
      }
      
      const scheduledDate = new Date(scheduledTime);
      const now = new Date();
      
      // Validate that scheduled time is in the future
      if (scheduledDate <= now) {
        return res.status(400).json({ error: "Scheduled time must be in the future" });
      }
      
      console.log(`[Schedule] Request to schedule for ${scheduledDate.toISOString()}, current time: ${now.toISOString()}, delay: ${Math.round((scheduledDate.getTime() - now.getTime()) / 1000)}s`);
      
      const order = await storage.updateOrderScheduledTime(req.params.id, scheduledTime);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      scheduleNotification(req.params.id, scheduledDate, message);
      
      res.json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid schedule data" });
      }
      res.status(500).json({ error: "Failed to schedule notification" });
    }
  });

  app.post("/api/orders/:id/offers", async (req, res) => {
    try {
      const offerSchema = z.object({
        title: z.string().min(1),
        description: z.string().min(1)
      });
      
      const { title, description } = offerSchema.parse(req.body);
      
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

  app.patch("/api/orders/:id/notes", async (req, res) => {
    try {
      const notesSchema = z.object({
        notes: z.string().max(500)
      });
      
      const { notes } = notesSchema.parse(req.body);
      
      const order = await storage.updateOrderNotes(req.params.id, notes);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Notify WebSocket subscribers
      notifyOrderUpdate(req.params.id);
      
      res.json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid notes data" });
      }
      res.status(500).json({ error: "Failed to update notes" });
    }
  });

  return httpServer;
}
