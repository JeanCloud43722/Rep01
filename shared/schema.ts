import { z } from "zod";
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  serial,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Zod schemas (preserved — used throughout the app) ───────────────────────

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
  sentAt: z.string(),
  sender: z.enum(["staff", "customer"])
});

export type Message = z.infer<typeof messageSchema>;

export const offerSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  createdAt: z.string()
});

export type Offer = z.infer<typeof offerSchema>;

export const serviceRequestSchema = z.object({
  id: z.string(),
  requestedAt: z.string(),
  acknowledgedAt: z.string().nullable()
});

export type ServiceRequest = z.infer<typeof serviceRequestSchema>;

export const orderSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  status: orderStatusEnum,
  subscription: pushSubscriptionSchema.nullable(),
  scheduledTime: z.string().nullable(),
  notifiedAt: z.string().nullable(),
  messages: z.array(messageSchema),
  offers: z.array(offerSchema),
  serviceRequests: z.array(serviceRequestSchema),
  notes: z.string().optional(),
  reactivationCount: z.number().default(0),
  lastReactivatedAt: z.string().nullable().default(null)
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

// ─── Drizzle table definitions ────────────────────────────────────────────────

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("waiting"),
    scheduledTime: timestamp("scheduled_time", { withTimezone: true }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    notes: text("notes"),
    messages: jsonb("messages").notNull().default(sql`'[]'::jsonb`),
    offers: jsonb("offers").notNull().default(sql`'[]'::jsonb`),
    serviceRequests: jsonb("service_requests").notNull().default(sql`'[]'::jsonb`),
    subscription: jsonb("subscription"),
  },
  (table) => [
    index("orders_status_idx").on(table.status),
    index("orders_created_at_idx").on(table.createdAt.desc()),
    index("orders_scheduled_time_idx")
      .on(table.scheduledTime)
      .where(sql`${table.status} = 'scheduled'`),
    check(
      "orders_status_check",
      sql`${table.status} IN ('waiting','subscribed','scheduled','notified','completed')`
    ),
  ]
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
  },
  (table) => [
    uniqueIndex("push_subscriptions_order_id_idx").on(table.orderId),
  ]
);

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
