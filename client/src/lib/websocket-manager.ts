type MessageHandler = (message: any) => void;
type ConnectionHandler = () => void;

interface WebSocketManagerConfig {
  url: string;
  orderId: string;
  onMessage: MessageHandler;
  onConnect?: ConnectionHandler;
  onDisconnect?: ConnectionHandler;
  onReconnecting?: (attempt: number) => void;
}

interface QueuedMessage {
  data: any;
  timestamp: number;
}

const STORAGE_KEY_PREFIX = 'ws_client_';
const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private config: WebSocketManagerConfig;
  private clientId: string;
  private lastMessageTimestamp: number;
  private messageQueue: QueuedMessage[] = [];
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private isManualClose = false;
  private visibilityHandler: (() => void) | null = null;

  constructor(config: WebSocketManagerConfig) {
    this.config = config;
    this.clientId = this.getStoredClientId() || this.generateClientId();
    this.lastMessageTimestamp = this.getStoredTimestamp() || Date.now();
    
    this.setupVisibilityHandler();
    this.connect();
  }

  private generateClientId(): string {
    const id = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.storeClientId(id);
    return id;
  }

  private getStoredClientId(): string | null {
    try {
      return localStorage.getItem(`${STORAGE_KEY_PREFIX}${this.config.orderId}_clientId`);
    } catch {
      return null;
    }
  }

  private storeClientId(id: string): void {
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${this.config.orderId}_clientId`, id);
    } catch {
      console.warn('[WS Manager] Failed to store client ID');
    }
  }

  private getStoredTimestamp(): number | null {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${this.config.orderId}_timestamp`);
      return stored ? parseInt(stored, 10) : null;
    } catch {
      return null;
    }
  }

  private storeTimestamp(timestamp: number): void {
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${this.config.orderId}_timestamp`, timestamp.toString());
      this.lastMessageTimestamp = timestamp;
    } catch {
      console.warn('[WS Manager] Failed to store timestamp');
    }
  }

  private setupVisibilityHandler(): void {
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        console.log('[WS Manager] Page became visible, checking connection');
        this.checkAndReconnect();
      } else {
        console.log('[WS Manager] Page became hidden');
      }
    };
    
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private checkAndReconnect(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('[WS Manager] Connection not open, reconnecting...');
      this.reconnect();
    } else {
      console.log('[WS Manager] Connection is open, requesting sync');
      this.requestSync();
    }
  }

  private requestSync(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'sync_request',
        lastTimestamp: this.lastMessageTimestamp
      }));
    }
  }

  private connect(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    this.isManualClose = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({
      id: this.config.orderId,
      clientId: this.clientId,
      lastTimestamp: this.lastMessageTimestamp.toString()
    });
    const wsUrl = `${protocol}//${window.location.host}/ws/orders?${params}`;

    console.log(`[WS Manager] Connecting to ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WS Manager] Connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.flushMessageQueue();
        this.config.onConnect?.();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'ping') {
            this.ws?.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            return;
          }

          if (message.type === 'connected') {
            if (message.clientId && message.clientId !== this.clientId) {
              this.clientId = message.clientId;
              this.storeClientId(message.clientId);
            }
            this.storeTimestamp(message.serverTimestamp || Date.now());
            return;
          }

          if (message.type === 'sync_response') {
            this.storeTimestamp(message.serverTimestamp || Date.now());
          }

          if (message.type === 'order_updated') {
            this.storeTimestamp(Date.now());
          }

          this.config.onMessage(message);
        } catch (e) {
          console.warn('[WS Manager] Failed to parse message:', e);
        }
      };

      this.ws.onclose = (event) => {
        console.log(`[WS Manager] Disconnected (code: ${event.code})`);
        this.isConnecting = false;
        this.config.onDisconnect?.();
        
        if (!this.isManualClose) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WS Manager] Error:', error);
        this.isConnecting = false;
      };
    } catch (error) {
      console.error('[WS Manager] Failed to create WebSocket:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[WS Manager] Max reconnect attempts reached');
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const backoff = Math.min(
      INITIAL_BACKOFF_MS * Math.pow(2, this.reconnectAttempts),
      MAX_BACKOFF_MS
    );

    this.reconnectAttempts++;
    console.log(`[WS Manager] Reconnecting in ${backoff}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    
    this.config.onReconnecting?.(this.reconnectAttempts);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, backoff);
  }

  private reconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = 0;
    this.connect();
  }

  public send(data: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    } else {
      this.messageQueue.push({ data, timestamp: Date.now() });
      console.log('[WS Manager] Message queued (connection not ready)');
      return false;
    }
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return;
    
    console.log(`[WS Manager] Flushing ${this.messageQueue.length} queued messages`);
    
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    
    for (const { data } of messages) {
      this.send(data);
    }
  }

  public getConnectionState(): 'connecting' | 'connected' | 'disconnected' | 'reconnecting' {
    if (this.isConnecting) return 'connecting';
    if (this.reconnectAttempts > 0 && this.reconnectTimeout) return 'reconnecting';
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return 'connected';
    return 'disconnected';
  }

  public getClientId(): string {
    return this.clientId;
  }

  public close(): void {
    this.isManualClose = true;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export function createWebSocketManager(config: WebSocketManagerConfig): WebSocketManager {
  return new WebSocketManager(config);
}
