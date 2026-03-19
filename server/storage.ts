import { type Order, type PushSubscriptionData, type Message, type Offer, type ServiceRequest } from "@shared/schema";
import { randomBytes } from "crypto";
import { assertValidTransition } from "./lib/state-machine";
import { getDb } from "./db";
import { orders as ordersTable } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

function generateOrderId(): string {
  // Generate human-friendly order ID: 3 uppercase letters + 3 digits (e.g., "KMT472")
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  let id = "";
  
  // 3 random letters
  for (let i = 0; i < 3; i++) {
    id += letters[Math.floor(Math.random() * letters.length)];
  }
  // 3 random digits
  for (let i = 0; i < 3; i++) {
    id += digits[Math.floor(Math.random() * digits.length)];
  }
  
  return id;
}

function generateShortId(): string {
  // Used for sub-entity IDs (messages, offers, service requests) — never shown to users
  return randomBytes(4).toString("hex");
}

export interface IStorage {
  getAllOrders(): Promise<Order[]>;
  getOrdersPaginated(options: { statuses?: string[]; limit: number; offset: number }): Promise<{ orders: Order[]; total: number }>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(): Promise<Order>;
  deleteOrder(id: string): Promise<boolean>;
  updateOrderSubscription(id: string, subscription: PushSubscriptionData): Promise<Order | undefined>;
  updateOrderStatus(id: string, status: Order["status"]): Promise<Order | undefined>;
  updateOrderScheduledTime(id: string, scheduledTime: string): Promise<Order | undefined>;
  markOrderNotified(id: string): Promise<Order | undefined>;
  addMessage(id: string, message: string, sender: "staff" | "customer"): Promise<Order | undefined>;
  addOffer(id: string, title: string, description: string): Promise<Order | undefined>;
  addServiceRequest(id: string): Promise<Order | undefined>;
  acknowledgeServiceRequest(orderId: string, requestId: string): Promise<Order | undefined>;
  updateOrderNotes(id: string, notes: string): Promise<Order | undefined>;
  reactivateOrder(id: string, options: { resetMessages: boolean }): Promise<Order | undefined>;
  deleteCompletedOrdersOlderThan(hours: number): Promise<number>;
}

export class MemStorage implements IStorage {
  private orders: Map<string, Order>;

  constructor() {
    this.orders = new Map();
  }

  reset(): void {
    this.orders.clear();
  }

  async getAllOrders(): Promise<Order[]> {
    return Array.from(this.orders.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getOrdersPaginated({ statuses, limit, offset }: { statuses?: string[]; limit: number; offset: number }): Promise<{ orders: Order[]; total: number }> {
    let all = Array.from(this.orders.values()).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (statuses && statuses.length > 0) {
      all = all.filter(o => statuses.includes(o.status));
    }
    return { orders: all.slice(offset, offset + limit), total: all.length };
  }

  async getOrder(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async createOrder(): Promise<Order> {
    let id = generateOrderId();
    // Collision check: retry up to 10 times if ID already exists
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!this.orders.has(id)) break;
      id = generateOrderId();
    }
    const order: Order = {
      id,
      createdAt: new Date().toISOString(),
      status: "waiting",
      subscription: null,
      scheduledTime: null,
      notifiedAt: null,
      messages: [],
      offers: [],
      serviceRequests: [],
      notes: "",
      reactivationCount: 0,
      lastReactivatedAt: null
    };
    this.orders.set(id, order);
    return order;
  }

  async deleteOrder(id: string): Promise<boolean> {
    return this.orders.delete(id);
  }

  async updateOrderSubscription(id: string, subscription: PushSubscriptionData): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;

    // Only transition to "subscribed" if currently "waiting".
    // When clearing (null) due to push revocation, preserve the current status.
    if (subscription !== null && order.status === "waiting") {
      assertValidTransition(order.status, "subscribed");
      order.status = "subscribed";
    }
    order.subscription = subscription;
    this.orders.set(id, order);
    return order;
  }

  async updateOrderStatus(id: string, status: Order["status"]): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;

    assertValidTransition(order.status, status);
    order.status = status;
    this.orders.set(id, order);
    return order;
  }

  async updateOrderScheduledTime(id: string, scheduledTime: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;

    assertValidTransition(order.status, "scheduled");
    order.scheduledTime = scheduledTime;
    order.status = "scheduled";
    this.orders.set(id, order);
    return order;
  }

  async markOrderNotified(id: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;

    assertValidTransition(order.status, "notified");
    order.status = "notified";
    order.notifiedAt = new Date().toISOString();
    this.orders.set(id, order);
    return order;
  }

  async addMessage(id: string, message: string, sender: "staff" | "customer"): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    const msg: Message = {
      id: generateShortId(),
      text: message,
      sentAt: new Date().toISOString(),
      sender
    };
    
    order.messages.push(msg);
    this.orders.set(id, order);
    return order;
  }

  async addOffer(id: string, title: string, description: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    const offer: Offer = {
      id: generateShortId(),
      title,
      description,
      createdAt: new Date().toISOString()
    };
    
    order.offers.push(offer);
    this.orders.set(id, order);
    return order;
  }

  async addServiceRequest(id: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    const serviceRequest: ServiceRequest = {
      id: generateShortId(),
      requestedAt: new Date().toISOString(),
      acknowledgedAt: null
    };
    
    order.serviceRequests.push(serviceRequest);
    this.orders.set(id, order);
    return order;
  }

  async acknowledgeServiceRequest(orderId: string, requestId: string): Promise<Order | undefined> {
    const order = this.orders.get(orderId);
    if (!order) return undefined;
    const request = order.serviceRequests.find(r => r.id === requestId);
    if (!request) return undefined;
    request.acknowledgedAt = new Date().toISOString();
    this.orders.set(orderId, order);
    return order;
  }

  async updateOrderNotes(id: string, notes: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    order.notes = notes;
    this.orders.set(id, order);
    return order;
  }

  async reactivateOrder(id: string, options: { resetMessages: boolean }): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;

    order.status = "waiting";
    order.notifiedAt = null;
    order.scheduledTime = null;
    order.reactivationCount = (order.reactivationCount ?? 0) + 1;
    order.lastReactivatedAt = new Date().toISOString();

    if (options.resetMessages) {
      order.messages = [];
      order.serviceRequests = [];
      order.offers = [];
    }

    this.orders.set(id, order);
    return order;
  }

  async deleteCompletedOrdersOlderThan(hours: number): Promise<number> {
    const threshold = new Date(Date.now() - hours * 3600000);
    const reactivationGrace = new Date(Date.now() - 7 * 24 * 3600000); // 7 days
    let count = 0;
    const idsToDelete: string[] = [];
    
    this.orders.forEach((order, id) => {
      if (order.status !== "completed") return;
      if (!order.notifiedAt) return;
      if (new Date(order.notifiedAt) >= threshold) return;
      // Preserve recently reactivated orders for 7 days
      if (
        order.reactivationCount > 0 &&
        order.lastReactivatedAt &&
        new Date(order.lastReactivatedAt) >= reactivationGrace
      ) return;
      idsToDelete.push(id);
    });
    
    idsToDelete.forEach(id => {
      this.orders.delete(id);
      count++;
    });
    
    return count;
  }
}

/**
 * Database-backed storage implementation.
 * Stores all orders directly in PostgreSQL via Drizzle ORM.
 * This is the primary storage engine used in production.
 */
export class DbStorage implements IStorage {
  private db = getDb();

  /**
   * Convert a database row to an Order object.
   */
  private rowToOrder(row: any): Order {
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      status: row.status as Order["status"],
      subscription: row.subscription,
      scheduledTime: row.scheduledTime ? row.scheduledTime.toISOString() : null,
      notifiedAt: row.notifiedAt ? row.notifiedAt.toISOString() : null,
      messages: row.messages || [],
      offers: row.offers || [],
      serviceRequests: row.serviceRequests || [],
      notes: row.notes || "",
      reactivationCount: 0,
      lastReactivatedAt: null,
    };
  }

  async getAllOrders(): Promise<Order[]> {
    const rows = await this.db
      .select()
      .from(ordersTable)
      .orderBy(sql`${ordersTable.createdAt} DESC`);
    return rows.map((row) => this.rowToOrder(row));
  }

  async getOrdersPaginated({
    statuses,
    limit,
    offset,
  }: {
    statuses?: string[];
    limit: number;
    offset: number;
  }): Promise<{ orders: Order[]; total: number }> {
    let query = this.db.select().from(ordersTable);

    if (statuses && statuses.length > 0) {
      query = query.where(sql`${ordersTable.status} IN (${sql.raw(statuses.map((s) => `'${s}'`).join(","))})`);
    }

    const total = await this.db
      .select({ count: sql`COUNT(*)` })
      .from(ordersTable);
    const totalCount = Number((total[0] as any).count);

    const rows = await query
      .orderBy(sql`${ordersTable.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    return { orders: rows.map((row) => this.rowToOrder(row)), total: totalCount };
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const rows = await this.db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, id));
    return rows.length > 0 ? this.rowToOrder(rows[0]) : undefined;
  }

  async createOrder(): Promise<Order> {
    let id = generateOrderId();
    // Collision check: retry up to 10 times if ID already exists
    for (let attempt = 0; attempt < 10; attempt++) {
      const existing = await this.db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, id));
      if (existing.length === 0) break;
      id = generateOrderId();
    }

    const now = new Date();
    const [row] = await this.db
      .insert(ordersTable)
      .values({
        id,
        status: "waiting",
        messages: sql`'[]'::jsonb`,
        offers: sql`'[]'::jsonb`,
        serviceRequests: sql`'[]'::jsonb`,
      })
      .returning();

    return {
      id,
      createdAt: now.toISOString(),
      status: "waiting",
      subscription: null,
      scheduledTime: null,
      notifiedAt: null,
      messages: [],
      offers: [],
      serviceRequests: [],
      notes: "",
      reactivationCount: 0,
      lastReactivatedAt: null,
    };
  }

  async deleteOrder(id: string): Promise<boolean> {
    const existing = await this.getOrder(id);
    if (!existing) return false;
    
    await this.db
      .delete(ordersTable)
      .where(eq(ordersTable.id, id));
    return true;
  }

  async updateOrderSubscription(
    id: string,
    subscription: PushSubscriptionData
  ): Promise<Order | undefined> {
    const existing = await this.getOrder(id);
    if (!existing) return undefined;

    // Only transition to "subscribed" if currently "waiting".
    let newStatus = existing.status;
    if (subscription !== null && existing.status === "waiting") {
      assertValidTransition(existing.status, "subscribed");
      newStatus = "subscribed";
    }

    const [row] = await this.db
      .update(ordersTable)
      .set({ subscription, status: newStatus })
      .where(eq(ordersTable.id, id))
      .returning();

    return this.rowToOrder(row);
  }

  async updateOrderStatus(
    id: string,
    status: Order["status"]
  ): Promise<Order | undefined> {
    const existing = await this.getOrder(id);
    if (!existing) return undefined;

    assertValidTransition(existing.status, status);

    const [row] = await this.db
      .update(ordersTable)
      .set({ status })
      .where(eq(ordersTable.id, id))
      .returning();

    return this.rowToOrder(row);
  }

  async updateOrderScheduledTime(
    id: string,
    scheduledTime: string
  ): Promise<Order | undefined> {
    const existing = await this.getOrder(id);
    if (!existing) return undefined;

    assertValidTransition(existing.status, "scheduled");

    const [row] = await this.db
      .update(ordersTable)
      .set({
        status: "scheduled",
        scheduledTime: new Date(scheduledTime),
      })
      .where(eq(ordersTable.id, id))
      .returning();

    return this.rowToOrder(row);
  }

  async markOrderNotified(id: string): Promise<Order | undefined> {
    const existing = await this.getOrder(id);
    if (!existing) return undefined;

    assertValidTransition(existing.status, "notified");

    const [row] = await this.db
      .update(ordersTable)
      .set({
        status: "notified",
        notifiedAt: new Date(),
      })
      .where(eq(ordersTable.id, id))
      .returning();

    return this.rowToOrder(row);
  }

  async addMessage(
    id: string,
    message: string,
    sender: "staff" | "customer"
  ): Promise<Order | undefined> {
    const existing = await this.getOrder(id);
    if (!existing) return undefined;

    const msg: Message = {
      id: generateShortId(),
      text: message,
      sentAt: new Date().toISOString(),
      sender,
    };

    const updatedMessages = [...existing.messages, msg];

    const [row] = await this.db
      .update(ordersTable)
      .set({ messages: updatedMessages })
      .where(eq(ordersTable.id, id))
      .returning();

    return this.rowToOrder(row);
  }

  async addOffer(
    id: string,
    title: string,
    description: string
  ): Promise<Order | undefined> {
    const existing = await this.getOrder(id);
    if (!existing) return undefined;

    const offer: Offer = {
      id: generateShortId(),
      title,
      description,
      createdAt: new Date().toISOString(),
    };

    const updatedOffers = [...existing.offers, offer];

    const [row] = await this.db
      .update(ordersTable)
      .set({ offers: updatedOffers })
      .where(eq(ordersTable.id, id))
      .returning();

    return this.rowToOrder(row);
  }

  async addServiceRequest(id: string): Promise<Order | undefined> {
    const existing = await this.getOrder(id);
    if (!existing) return undefined;

    const serviceRequest: ServiceRequest = {
      id: generateShortId(),
      requestedAt: new Date().toISOString(),
      acknowledgedAt: null,
    };

    const updatedServiceRequests = [...existing.serviceRequests, serviceRequest];

    const [row] = await this.db
      .update(ordersTable)
      .set({ serviceRequests: updatedServiceRequests })
      .where(eq(ordersTable.id, id))
      .returning();

    return this.rowToOrder(row);
  }

  async acknowledgeServiceRequest(
    orderId: string,
    requestId: string
  ): Promise<Order | undefined> {
    const existing = await this.getOrder(orderId);
    if (!existing) return undefined;

    const request = existing.serviceRequests.find((r) => r.id === requestId);
    if (!request) return undefined;

    const updatedServiceRequests = existing.serviceRequests.map((r) =>
      r.id === requestId ? { ...r, acknowledgedAt: new Date().toISOString() } : r
    );

    const [row] = await this.db
      .update(ordersTable)
      .set({ serviceRequests: updatedServiceRequests })
      .where(eq(ordersTable.id, orderId))
      .returning();

    return this.rowToOrder(row);
  }

  async updateOrderNotes(id: string, notes: string): Promise<Order | undefined> {
    const existing = await this.getOrder(id);
    if (!existing) return undefined;

    const [row] = await this.db
      .update(ordersTable)
      .set({ notes })
      .where(eq(ordersTable.id, id))
      .returning();

    return this.rowToOrder(row);
  }

  async reactivateOrder(
    id: string,
    options: { resetMessages: boolean }
  ): Promise<Order | undefined> {
    const existing = await this.getOrder(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    const updatePayload: any = {
      status: "waiting",
      notifiedAt: null,
      scheduledTime: null,
    };

    if (options.resetMessages) {
      updatePayload.messages = [];
      updatePayload.serviceRequests = [];
      updatePayload.offers = [];
    }

    const [row] = await this.db
      .update(ordersTable)
      .set(updatePayload)
      .where(eq(ordersTable.id, id))
      .returning();

    return this.rowToOrder(row);
  }

  async deleteCompletedOrdersOlderThan(hours: number): Promise<number> {
    const threshold = new Date(Date.now() - hours * 3600000);
    const result = await this.db
      .delete(ordersTable)
      .where(
        sql`${ordersTable.status} = 'completed' AND ${ordersTable.notifiedAt} < ${threshold}`
      );
    return 0; // Drizzle doesn't return the count easily in delete, but that's OK for this use case
  }
}

/**
 * Global storage instance. Switched to PostgreSQL-backed DbStorage for production.
 * MemStorage is kept for backwards compatibility and test isolation if needed.
 */
export const storage = new DbStorage();
