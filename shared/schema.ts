import { z } from "zod";

export const orderStatusEnum = z.enum([
  "waiting",
  "subscribed", 
  "scheduled",
  "notified",
  "completed"
]);

export type OrderStatus = z.infer<typeof orderStatusEnum>;

export const pushSubscriptionSchema = z.object({
  endpoint: z.string(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string()
  })
});

export type PushSubscriptionData = z.infer<typeof pushSubscriptionSchema>;

export const messageSchema = z.object({
  id: z.string(),
  text: z.string(),
  sentAt: z.string()
});

export type Message = z.infer<typeof messageSchema>;

export const offerSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  createdAt: z.string()
});

export type Offer = z.infer<typeof offerSchema>;

export const orderSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  status: orderStatusEnum,
  subscription: pushSubscriptionSchema.nullable(),
  scheduledTime: z.string().nullable(),
  notifiedAt: z.string().nullable(),
  messages: z.array(messageSchema),
  offers: z.array(offerSchema)
});

export type Order = z.infer<typeof orderSchema>;

export const insertOrderSchema = z.object({});

export type InsertOrder = z.infer<typeof insertOrderSchema>;

export const subscribeSchema = z.object({
  orderId: z.string(),
  subscription: pushSubscriptionSchema
});

export type SubscribeRequest = z.infer<typeof subscribeSchema>;

export const triggerNotificationSchema = z.object({
  orderId: z.string(),
  message: z.string().optional()
});

export type TriggerNotificationRequest = z.infer<typeof triggerNotificationSchema>;

export const scheduleNotificationSchema = z.object({
  orderId: z.string(),
  scheduledTime: z.string(),
  message: z.string().optional()
});

export type ScheduleNotificationRequest = z.infer<typeof scheduleNotificationSchema>;
