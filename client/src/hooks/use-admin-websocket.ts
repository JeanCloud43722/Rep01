import { useState, useEffect, useRef } from "react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export function useAdminWebSocket(
  onEvent: (eventType: string, orderId: string) => void
): { connectionStatus: ConnectionStatus } {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");

  // Keep onEvent ref current so the effect never needs to re-run when the callback identity changes
  const onEventRef = useRef(onEvent);
  useEffect(() => { onEventRef.current = onEvent; });

  useEffect(() => {
    const MAX_ATTEMPTS = 10;
    const INITIAL_BACKOFF = 1000;
    const MAX_BACKOFF = 30000;

    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let isManualClose = false;

    const connect = () => {
      if (isManualClose) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/admin`;

      setConnectionStatus("connecting");

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log("[Admin WS] Connected");
          reconnectAttempts = 0;
          setConnectionStatus("connected");
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            if (message.type === "ping") {
              ws?.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
              return;
            }

            if (message.type === "connected") {
              console.log("[Admin WS] Connection acknowledged");
              return;
            }

            if (message.type === "admin_update" && message.eventType) {
              onEventRef.current(message.eventType, message.orderId ?? "");
            }
          } catch (e) {
            console.warn("[Admin WS] Failed to parse message:", e);
          }
        };

        ws.onclose = (event) => {
          if (isManualClose) return;

          if (event.code === 4001) {
            console.warn("[Admin WS] Unauthorized — redirecting to login");
            window.location.href = "/login";
            return;
          }

          if (reconnectAttempts < MAX_ATTEMPTS) {
            const backoff = Math.min(INITIAL_BACKOFF * Math.pow(2, reconnectAttempts), MAX_BACKOFF);
            reconnectAttempts++;
            console.log(`[Admin WS] Reconnecting in ${backoff}ms (attempt ${reconnectAttempts}/${MAX_ATTEMPTS})`);
            setConnectionStatus("reconnecting");
            reconnectTimeout = setTimeout(connect, backoff);
          } else {
            setConnectionStatus("disconnected");
          }
        };

        ws.onerror = () => {
          console.error("[Admin WS] WebSocket error");
          ws?.close();
        };
      } catch (error) {
        console.error("[Admin WS] Failed to connect:", error);
        if (reconnectAttempts < MAX_ATTEMPTS) {
          const backoff = Math.min(INITIAL_BACKOFF * Math.pow(2, reconnectAttempts), MAX_BACKOFF);
          reconnectAttempts++;
          setConnectionStatus("reconnecting");
          reconnectTimeout = setTimeout(connect, backoff);
        } else {
          setConnectionStatus("disconnected");
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && (!ws || ws.readyState !== WebSocket.OPEN)) {
        console.log("[Admin WS] Page became visible, reconnecting...");
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectAttempts = 0;
        connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    connect();

    return () => {
      isManualClose = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []); // effect runs once; onEvent accessed via ref

  return { connectionStatus };
}
