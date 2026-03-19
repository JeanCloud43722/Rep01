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

export type MenuEvent = MenuUpdatedEvent | ProductImageAddedEvent;

class EventBus extends EventEmitter {}

export const eventBus = new EventBus();
eventBus.setMaxListeners(20);

export function publishMenuEvent(event: MenuEvent): void {
  eventBus.emit("menu:updates", event);
}
