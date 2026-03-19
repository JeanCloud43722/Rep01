import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface MenuUpdatedEvent {
  type: "MENU_UPDATED";
  timestamp: string;
  summary: { inserted: number; updated: number; skipped: number };
  changedProductIds: number[];
}

interface ProductImageAddedEvent {
  type: "PRODUCT_IMAGE_ADDED";
  productId: number;
  imageUrl: string;
}

type MenuEvent = MenuUpdatedEvent | ProductImageAddedEvent;

/**
 * OPT-4: Connects to /ws/admin and listens for MENU_UPDATED / PRODUCT_IMAGE_ADDED
 * events, then invalidates the React Query products cache so UI refreshes automatically.
 *
 * Drop this hook into any admin page that displays the product catalog.
 */
export function useProductCatalogUpdates(
  onMenuUpdated?: (event: MenuUpdatedEvent) => void
) {
  const queryClient = useQueryClient();
  const onMenuUpdatedRef = useRef(onMenuUpdated);
  useEffect(() => {
    onMenuUpdatedRef.current = onMenuUpdated;
  });

  useEffect(() => {
    const MAX_ATTEMPTS = 5;
    const INITIAL_BACKOFF = 2000;

    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let isManualClose = false;

    const connect = () => {
      if (isManualClose) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/admin`;

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log("[ProductCatalog WS] Connected");
          reconnectAttempts = 0;
        };

        ws.onmessage = (event) => {
          try {
            const raw = JSON.parse(event.data) as Record<string, unknown>;
            const msgType = raw.type as string;

            if (msgType === "ping") {
              ws?.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
              return;
            }

            if (msgType === "MENU_UPDATED") {
              const typed = raw as unknown as MenuUpdatedEvent;
              console.log("[ProductCatalog WS] Menu updated — invalidating cache", typed.summary);
              queryClient.invalidateQueries({ queryKey: ["/api/products"] });
              onMenuUpdatedRef.current?.(typed);
              return;
            }

            if (msgType === "PRODUCT_IMAGE_ADDED") {
              const typed = raw as unknown as ProductImageAddedEvent;
              console.log("[ProductCatalog WS] Product image added", typed.productId);
              queryClient.invalidateQueries({ queryKey: ["/api/products"] });
            }
          } catch (e) {
            console.warn("[ProductCatalog WS] Failed to parse message:", e);
          }
        };

        ws.onclose = (event) => {
          if (isManualClose) return;
          if (event.code === 4001) return; // auth error — don't reconnect

          if (reconnectAttempts < MAX_ATTEMPTS) {
            const backoff = Math.min(INITIAL_BACKOFF * Math.pow(2, reconnectAttempts), 30_000);
            reconnectAttempts++;
            console.log(`[ProductCatalog WS] Reconnecting in ${backoff}ms (attempt ${reconnectAttempts}/${MAX_ATTEMPTS})`);
            reconnectTimeout = setTimeout(connect, backoff);
          }
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch (error) {
        console.error("[ProductCatalog WS] Failed to create connection:", error);
      }
    };

    connect();

    return () => {
      isManualClose = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [queryClient]);
}
