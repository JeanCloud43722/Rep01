import { getDb } from "../db";
import { products, orders, orderItems, idempotencyKeys } from "../../shared/schema";
import { eq, inArray } from "drizzle-orm";

export const VITEST_PRODUCT_PREFIX = "VITEST__";

export interface TestProductOptions {
  name?: string;
  category?: string;
  price?: string;
  isActive?: boolean;
  tags?: string[];
  variants?: Array<{ name: string; price: number }>;
}

export async function insertTestProduct(opts: TestProductOptions = {}): Promise<number> {
  const db = getDb();
  const name = opts.name ?? `${VITEST_PRODUCT_PREFIX}Margherita`;
  const category = opts.category ?? "pizza";
  const [row] = await db
    .insert(products)
    .values({
      name,
      category,
      price: opts.price ?? "12.00",
      isActive: opts.isActive ?? true,
      tags: opts.tags ?? [],
      allergens: [],
      variants: opts.variants ?? null,
    })
    .onConflictDoUpdate({
      target: [products.name, products.category],
      set: {
        price: opts.price ?? "12.00",
        isActive: opts.isActive ?? true,
        tags: opts.tags ?? [],
        allergens: [],
        variants: opts.variants ?? null,
      },
    })
    .returning({ id: products.id });
  return row.id;
}

export async function cleanupTestProducts(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  await db.delete(orderItems).where(inArray(orderItems.productId, ids));
  await db.delete(products).where(inArray(products.id, ids));
}

/**
 * Inserts an order row into the PostgreSQL `orders` table to satisfy the FK
 * constraint on `order_items.order_id`. The MemStorage layer only keeps orders
 * in-memory; without this, confirm-order inserts would always fail the FK check.
 */
export async function syncOrderToDb(orderId: string): Promise<void> {
  const db = getDb();
  await db
    .insert(orders)
    .values({ id: orderId })
    .onConflictDoNothing();
}

export async function cleanupOrderData(orderId: string): Promise<void> {
  const db = getDb();
  await db.delete(idempotencyKeys).where(eq(idempotencyKeys.orderId, orderId));
  // order_items cascade-deletes when the parent orders row is removed
  await db.delete(orders).where(eq(orders.id, orderId));
}
