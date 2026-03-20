import { z } from "zod";
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  serial,
  integer,
  numeric,
  boolean,
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

// ─── Products table ────────────────────────────────────────────────────────────
// OPT-1: Dynamic categories — no hardcoded enum; category is a free-form string
// OPT-3: Product variants — jsonb column supports size/type-based pricing

/** @deprecated Use the dynamic `category` field on products instead */
export const PRODUCT_CATEGORIES = [
  "Starters", "Soups", "Steaks", "Burgers", "Pasta", "Fish",
  "Lamb", "Vegetarian", "Ice Cream", "Drinks", "Desserts", "Sides", "Other",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

// OPT-3: Variant schema for size/type-based pricing
export const variantSchema = z.object({
  name: z.string().min(1).max(30),
  price: z.number().positive().max(999.99),
  description: z.string().max(100).optional(),
});

export type ProductVariant = z.infer<typeof variantSchema>;

// OPT-1 + OPT-2 + OPT-3: Dynamic, SaaS-generic product schema
export const productSchema = z.object({
  name: z.string().min(1).max(150).transform((s) => s.trim()),
  description: z.string().max(500).nullable().optional(),
  // OPT-1: Category is a free-form string (lowercase-normalised), not an enum
  category: z.string().min(1).max(50).transform((s) => s.trim().toLowerCase()),
  categoryGroup: z.string().max(50).nullish(),
  // OPT-3: price is optional when variants are provided
  price: z.number().positive().max(999.99).nullish(),
  variants: z.array(variantSchema).nullish(),
  defaultVariant: z.string().nullish(),
  allergens: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  image_url: z.string().url().nullable().optional(),
  source: z.string().optional(),
  // Prompt 30.1: Stock validation — defaults to true for availability
  isActive: z.boolean().default(true),
  deactivatedAt: z.string().datetime().optional().or(z.null()),
  // OPT-2: fuzzy deduplication — DeepSeek may return an existing product ID
  existingProductId: z.number().int().positive().optional(),
}).refine(
  (data) => data.price != null || (data.variants != null && data.variants.length > 0),
  { message: "Product must have either price or variants" }
);

export type ProductInput = z.infer<typeof productSchema>;

// ─── Drizzle products table ────────────────────────────────────────────────────
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    // Nullable: variant-only products do not have a single price
    price: numeric("price", { precision: 10, scale: 2 }),
    // OPT-1: free-form string, no enum constraint
    category: text("category").notNull(),
    categoryGroup: text("category_group"),
    // OPT-3: JSONB variants column
    variants: jsonb("variants").$type<Array<{ name: string; price: number; description?: string }>>(),
    defaultVariant: text("default_variant"),
    allergens: text("allergens").array().notNull().default(sql`'{}'::text[]`),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    imageUrl: text("image_url"),
    source: text("source"),
    // Stock validation (Prompt 30.1): default true ensures all existing products remain available
    isActive: boolean("is_active").notNull().default(true),
    deactivatedAt: timestamp("deactivated_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("products_name_idx").on(t.name),
    index("products_category_idx").on(t.category),
    index("products_cat_group_idx").on(t.category, t.categoryGroup),
    index("products_active_idx").on(t.isActive),
    uniqueIndex("products_name_category_idx").on(t.name, t.category),
  ]
);

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Order items (confirmed via AI ordering chat) ─────────────────────────────
export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    variantName: text("variant_name"),
    quantity: integer("quantity").notNull().default(1),
    modifications: text("modifications"),
    priceAtTime: numeric("price_at_time", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId, t.productId),
    check("order_items_qty_check", sql`${t.quantity} > 0`),
  ]
);

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

// ─── Idempotency keys (prevent duplicate order confirmations) ─────────────────
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    orderId: text("order_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idempotency_order_idx").on(t.orderId)]
);
