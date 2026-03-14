import { type Order, type PushSubscriptionData, type Message, type Offer, type ServiceRequest } from "@shared/schema";
import { randomBytes } from "crypto";
import { assertValidTransition } from "./lib/state-machine";

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
      notes: ""
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

  async deleteCompletedOrdersOlderThan(hours: number): Promise<number> {
    const threshold = new Date(Date.now() - hours * 3600000);
    let count = 0;
    const idsToDelete: string[] = [];
    
    this.orders.forEach((order, id) => {
      if (order.status === "completed" && order.notifiedAt && new Date(order.notifiedAt) < threshold) {
        idsToDelete.push(id);
      }
    });
    
    idsToDelete.forEach(id => {
      this.orders.delete(id);
      count++;
    });
    
    return count;
  }
}

export const storage = new MemStorage();
