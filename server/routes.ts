import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import webPush from "web-push";
import schedule from "node-schedule";
import { pushSubscriptionSchema } from "@shared/schema";
import { z } from "zod";
import { WebSocketServer } from "ws";

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
  notifyOrderUpdate(orderId);
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

function notifyOrderUpdate(orderId: string) {
  const subscribers = orderSubscribers.get(orderId);
  if (subscribers) {
    const message = JSON.stringify({ type: "order_updated" });
    subscribers.forEach((ws) => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(message);
      }
    });
  }
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
  
  // Restore scheduled notifications on startup
  await restoreScheduledNotifications();
  
  wss.on("connection", (ws, req) => {
    const url = req.url;
    const orderId = url?.split("?id=")[1];
    
    if (!orderId) {
      ws.close();
      return;
    }
    
    // Add this connection to the order's subscribers
    if (!orderSubscribers.has(orderId)) {
      orderSubscribers.set(orderId, new Set());
    }
    orderSubscribers.get(orderId)!.add(ws);
    
    ws.on("close", () => {
      const subscribers = orderSubscribers.get(orderId);
      if (subscribers) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
          orderSubscribers.delete(orderId);
        }
      }
    });
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
      notifyOrderUpdate(req.params.id);
      
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
      
      // Notify WebSocket subscribers
      notifyOrderUpdate(req.params.id);
      
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
