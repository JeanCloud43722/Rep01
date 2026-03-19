import { EventEmitter } from "events";

export interface MenuUpdatedEvent {
  type: "MENU_UPDATED";
  timestamp: string;
  summary: { inserted: number; updated: number; skipped: number };
  changedProductIds: number[];
}

export interface ProductImageAddedEvent {
  type: "PRODUCT_IMAGE_ADDED";
  productId: number;
  imageUrl: string;
}

export interface OrderConfirmedEvent {
  type: "ORDER_CONFIRMED";
  orderId: string;
  items: Array<{
    id: number;
    orderId: string;
    productId: number;
    variantName: string | null;
    quantity: number;
    modifications: string | null;
    priceAtTime: string;
    createdAt: Date | null;
  }>;
  timestamp: string;
}

export type MenuEvent = MenuUpdatedEvent | ProductImageAddedEvent;
export type OrderEvent = OrderConfirmedEvent;

class EventBus extends EventEmitter {}

export const eventBus = new EventBus();
eventBus.setMaxListeners(20);

export function publishMenuEvent(event: MenuEvent): void {
  eventBus.emit("menu:updates", event);
}

export function publishOrderEvent(event: OrderEvent): void {
  eventBus.emit("order:confirmed", event);
}
