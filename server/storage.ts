import { type Order, type PushSubscriptionData } from "@shared/schema";
import { randomBytes } from "crypto";

function generateShortId(): string {
  return randomBytes(4).toString("hex");
}

export interface IStorage {
  getAllOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(): Promise<Order>;
  deleteOrder(id: string): Promise<boolean>;
  updateOrderSubscription(id: string, subscription: PushSubscriptionData): Promise<Order | undefined>;
  updateOrderStatus(id: string, status: Order["status"]): Promise<Order | undefined>;
  updateOrderScheduledTime(id: string, scheduledTime: string): Promise<Order | undefined>;
  markOrderNotified(id: string): Promise<Order | undefined>;
}

export class MemStorage implements IStorage {
  private orders: Map<string, Order>;

  constructor() {
    this.orders = new Map();
  }

  async getAllOrders(): Promise<Order[]> {
    return Array.from(this.orders.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getOrder(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async createOrder(): Promise<Order> {
    const id = generateShortId();
    const order: Order = {
      id,
      createdAt: new Date().toISOString(),
      status: "waiting",
      subscription: null,
      scheduledTime: null,
      notifiedAt: null
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
    
    order.subscription = subscription;
    order.status = "subscribed";
    this.orders.set(id, order);
    return order;
  }

  async updateOrderStatus(id: string, status: Order["status"]): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    order.status = status;
    this.orders.set(id, order);
    return order;
  }

  async updateOrderScheduledTime(id: string, scheduledTime: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    order.scheduledTime = scheduledTime;
    order.status = "scheduled";
    this.orders.set(id, order);
    return order;
  }

  async markOrderNotified(id: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    order.status = "notified";
    order.notifiedAt = new Date().toISOString();
    this.orders.set(id, order);
    return order;
  }
}

export const storage = new MemStorage();
