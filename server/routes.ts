import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import webPush from "web-push";
import schedule from "node-schedule";
import { pushSubscriptionSchema } from "@shared/schema";
import { z } from "zod";

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

async function sendPushNotification(orderId: string, message?: string) {
  const order = await storage.getOrder(orderId);
  if (!order || !order.subscription) {
    throw new Error("Order not found or no subscription");
  }

  const payload = JSON.stringify({
    title: "Order Ready!",
    body: message || "Your order is ready for pickup!",
    url: `/order/${orderId}`
  });

  try {
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
    
    await storage.markOrderNotified(orderId);
    return true;
  } catch (error) {
    console.error("Failed to send push notification:", error);
    throw error;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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
      await sendPushNotification(req.params.id, message);
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
      
      const existingJob = scheduledJobs.get(req.params.id);
      if (existingJob) {
        existingJob.cancel();
      }
      
      const order = await storage.updateOrderScheduledTime(req.params.id, scheduledTime);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      const scheduledDate = new Date(scheduledTime);
      const job = schedule.scheduleJob(scheduledDate, async () => {
        try {
          await sendPushNotification(req.params.id, message);
          scheduledJobs.delete(req.params.id);
        } catch (error) {
          console.error("Scheduled notification failed:", error);
        }
      });
      
      if (job) {
        scheduledJobs.set(req.params.id, job);
      }
      
      res.json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid schedule data" });
      }
      res.status(500).json({ error: "Failed to schedule notification" });
    }
  });

  return httpServer;
}
