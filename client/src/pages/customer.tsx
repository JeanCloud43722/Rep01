import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { audioManager } from "@/lib/audio-manager";
import { detectCapabilities } from "@/lib/device-capabilities";
import { offlineStorage } from "@/lib/indexed-db-storage";
import { useToast } from "@/hooks/use-toast";
import { AudioUnlockOverlay } from "@/components/audio-unlock-overlay";
import type { Order } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Check, 
  Clock, 
  Loader2, 
  AlertCircle,
  CheckCircle2,
  Calendar,
  Send,
  Gift,
  Bell,
  Volume2,
  VolumeX,
  MessageSquare,
  Smartphone
} from "lucide-react";

type QueuedNotification = {
  type: 'order_ready' | 'message' | 'offer' | 'status_update';
  timestamp: number;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getStatusConfig(status: Order["status"]) {
  switch (status) {
    case "waiting":
    case "subscribed":
      return {
        icon: Clock,
        title: "Order Registered",
        description: "We're preparing your order. You'll be alerted when it's ready!",
        color: "text-primary"
      };
    case "scheduled":
      return {
        icon: Calendar,
        title: "Order In Progress",
        description: "Your order is being prepared. You'll be alerted soon!",
        color: "text-primary"
      };
    case "notified":
    case "completed":
      return {
        icon: CheckCircle2,
        title: "Order Ready!",
        description: "Your order is ready for pickup",
        color: "text-green-600 dark:text-green-500"
      };
    default:
      return {
        icon: AlertCircle,
        title: "Unknown Status",
        description: "Please contact staff for assistance",
        color: "text-muted-foreground"
      };
  }
}

function formatTime(isoString: string) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatRemainingTime(scheduledTime: string): string {
  const now = new Date();
  const scheduled = new Date(scheduledTime);
  const diff = scheduled.getTime() - now.getTime();
  
  if (diff <= 0) {
    return "Should be ready now!";
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s remaining`;
  }
  return `${minutes}m ${seconds}s remaining`;
}

function SubscribedCard({ order, onRequestService, isRequestingService }: { order: Order; onRequestService: () => void; isRequestingService: boolean }) {
  const statusConfig = getStatusConfig(order.status);
  const StatusIcon = statusConfig.icon;
  const [remainingTime, setRemainingTime] = useState<string>("");
  
  useEffect(() => {
    if (!order.scheduledTime || order.status !== "scheduled") return;
    
    const scheduledTime = order.scheduledTime;
    setRemainingTime(formatRemainingTime(scheduledTime));
    
    const interval = setInterval(() => {
      setRemainingTime(formatRemainingTime(scheduledTime));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [order.scheduledTime, order.status]);
  
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col items-center text-center space-y-6">
          <div className={`w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center ${order.status === "notified" || order.status === "completed" ? "bg-green-100 dark:bg-green-900/30" : ""}`}>
            <StatusIcon className={`h-10 w-10 ${statusConfig.color}`} />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-semibold" data-testid="text-status-title">{statusConfig.title}</h3>
            <p className="text-muted-foreground" data-testid="text-status-description">
              {statusConfig.description}
            </p>
          </div>
          
          {order.scheduledTime && order.status === "scheduled" && (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 text-lg font-semibold text-primary bg-primary/10 rounded-lg px-4 py-3 w-full">
                <Clock className="h-5 w-5" />
                <span data-testid="text-remaining-time">{remainingTime}</span>
              </div>
              <p className="text-xs text-muted-foreground">Ready at {formatTime(order.scheduledTime)}</p>
            </div>
          )}
          
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
            <Check className="h-4 w-4" />
            <span>This page updates automatically</span>
          </div>
          
          <Button 
            variant="destructive"
            size="lg"
            onClick={onRequestService}
            disabled={isRequestingService}
            className="mt-4 w-full max-w-xs"
            data-testid="button-request-service"
          >
            {isRequestingService ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <AlertCircle className="h-5 w-5 mr-2" />
            )}
            {isRequestingService ? "Calling Waiter..." : "Call Waiter"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderNotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Order Not Found</h3>
              <p className="text-sm text-muted-foreground">
                This order link is invalid or has expired. Please contact the restaurant staff.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <Skeleton className="h-8 w-32 mx-auto mb-2" />
          <Skeleton className="h-4 w-48 mx-auto" />
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-6">
          <Skeleton className="w-20 h-20 rounded-full" />
          <div className="space-y-2 w-full">
            <Skeleton className="h-6 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </div>
          <Skeleton className="h-12 w-full max-w-xs" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function CustomerPage() {
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [hasRegistered, setHasRegistered] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [newMessageId, setNewMessageId] = useState<string | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(() => audioManager.isUnlocked);
  const [pushEnabled, setPushEnabled] = useState(false);
  const lastMessageCountRef = useRef<number>(0);
  const messagesCardRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false);
  const capabilities = detectCapabilities();
  const queuedNotificationsRef = useRef<QueuedNotification[]>([]);
  const isPageVisibleRef = useRef(true);
  
  useEffect(() => {
    const unsubscribe = audioManager.onUnlockChange((isUnlocked) => {
      setAudioUnlocked(isUnlocked);
    });
    return unsubscribe;
  }, []);
  
  const [cachedOrder, setCachedOrder] = useState<Order | null>(null);
  const [dataEvicted, setDataEvicted] = useState(false);
  
  useEffect(() => {
    if (!orderId) return;
    
    const loadCachedData = async () => {
      try {
        const evicted = await offlineStorage.checkEviction();
        setDataEvicted(evicted);
        
        if (!evicted) {
          const cached = await offlineStorage.getOrder(orderId);
          if (cached) {
            console.log('[Offline] Loaded cached order:', cached.id);
            setCachedOrder(cached);
          }
        }
      } catch (e) {
        console.warn('[Offline] Failed to load cached data:', e);
      }
    };
    
    loadCachedData();
  }, [orderId]);
  
  const { data: order, isLoading, error } = useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    enabled: !!orderId,
    refetchInterval: 4000,
    initialData: cachedOrder || undefined
  });
  
  useEffect(() => {
    if (order && orderId) {
      offlineStorage.saveOrder(order).catch(e => {
        console.warn('[Offline] Failed to save order:', e);
      });
    }
  }, [order, orderId]);
  
  const handleAudioUnlock = useCallback(() => {
    setAudioUnlocked(true);
    console.log('[Audio] Audio unlock callback, syncing state');
    
    if (queuedNotificationsRef.current.length > 0) {
      console.log(`[Audio] Playing ${queuedNotificationsRef.current.length} queued notifications`);
      queuedNotificationsRef.current.forEach((notification, index) => {
        setTimeout(() => {
          const cue = notification.type === 'order_ready' ? 'order-ready' : 
                      notification.type === 'message' ? 'message' :
                      notification.type === 'offer' ? 'offer' : 'status-update';
          audioManager.playIfUnlocked(cue);
        }, index * 500);
      });
      queuedNotificationsRef.current = [];
    }
  }, []);
  
  const subscribeToPush = async () => {
    if (!orderId) return;
    
    try {
      console.log('[Push] Starting push subscription...');
      
      if (!("Notification" in window)) {
        console.log('[Push] Notifications not supported');
        return;
      }
      
      const permission = await Notification.requestPermission();
      console.log('[Push] Permission:', permission);
      
      if (permission !== "granted") {
        console.log('[Push] Permission denied');
        return;
      }
      
      const vapidResponse = await fetch("/api/vapid-public-key");
      const { publicKey } = await vapidResponse.json();
      console.log('[Push] Got VAPID key');
      
      const registration = await navigator.serviceWorker.ready;
      console.log('[Push] Service worker ready');
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
      
      console.log('[Push] Got subscription:', subscription.endpoint);
      
      await apiRequest("POST", `/api/orders/${orderId}/subscribe`, {
        subscription: subscription.toJSON()
      });
      
      console.log('[Push] Subscription saved');
      setPushEnabled(true);
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    } catch (error) {
      console.error('[Push] Subscription failed:', error);
    }
  };
  
  const playSound = useCallback((type: 'order_ready' | 'message' | 'offer' | 'status_update') => {
    console.log(`[Audio] Playing sound for: ${type}, isUnlocked: ${audioManager.isUnlocked}, isVisible: ${isPageVisibleRef.current}`);
    
    if (!isPageVisibleRef.current) {
      queuedNotificationsRef.current.push({ type, timestamp: Date.now() });
      console.log('[Audio] Page hidden, queued notification for later playback');
      return;
    }
    
    if (!audioManager.isUnlocked) {
      queuedNotificationsRef.current.push({ type, timestamp: Date.now() });
      console.log('[Audio] Audio not unlocked, queued notification');
      return;
    }
    
    const cue = type === 'order_ready' ? 'order-ready' : 
                type === 'message' ? 'message' :
                type === 'offer' ? 'offer' : 'status-update';
    
    audioManager.playIfUnlocked(cue);
  }, []);
  
  useEffect(() => {
    const handleVisibilityChange = () => {
      const wasHidden = !isPageVisibleRef.current;
      isPageVisibleRef.current = document.visibilityState === 'visible';
      
      if (isPageVisibleRef.current && wasHidden && audioManager.isUnlocked) {
        if (queuedNotificationsRef.current.length > 0) {
          console.log(`[Audio] Page became visible, playing ${queuedNotificationsRef.current.length} queued sounds`);
          queuedNotificationsRef.current.forEach((notification, index) => {
            setTimeout(() => {
              const cue = notification.type === 'order_ready' ? 'order-ready' : 
                          notification.type === 'message' ? 'message' :
                          notification.type === 'offer' ? 'offer' : 'status-update';
              audioManager.playIfUnlocked(cue);
            }, index * 300);
          });
          queuedNotificationsRef.current = [];
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
  
  // Listen for Service Worker messages (triggered by push notifications)
  useEffect(() => {
    if (!navigator.serviceWorker) return;
    
    const handleSwMessage = (event: MessageEvent) => {
      console.log('[SW Message] Received:', event.data);
      if (event.data?.type === 'ORDER_READY') {
        console.log('[SW Message] ORDER_READY - playing buzzer');
        playSound('order_ready');
        queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      }
    };
    
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, [orderId]);
  
  useEffect(() => {
    if (order && order.messages.length > lastMessageCountRef.current) {
      if (lastMessageCountRef.current > 0) {
        setHasNewMessage(true);
        const newestMessage = order.messages[order.messages.length - 1];
        if (newestMessage) {
          setNewMessageId(newestMessage.id);
        }
      }
      lastMessageCountRef.current = order.messages.length;
    }
  }, [order?.messages.length]);
  
  useEffect(() => {
    if (!hasNewMessage || !messagesCardRef.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setTimeout(() => {
            setHasNewMessage(false);
          }, 2000);
        }
      },
      { threshold: 0.5 }
    );
    
    observer.observe(messagesCardRef.current);
    return () => observer.disconnect();
  }, [hasNewMessage]);
  
  const registerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/orders/${orderId}/register`);
    },
    onSuccess: () => {
      setHasRegistered(true);
      audioManager.playIfUnlocked('message');
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    }
  });
  
  const serviceRequestMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/orders/${orderId}/service`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    }
  });
  
  const [customerMessage, setCustomerMessage] = useState("");
  const customerMessageMutation = useMutation({
    mutationFn: async () => {
      if (!customerMessage.trim()) return;
      return apiRequest("POST", `/api/orders/${orderId}/customer-message`, {
        message: customerMessage.trim()
      });
    },
    onSuccess: () => {
      setCustomerMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    }
  });
  
  const handleRequestService = () => {
    serviceRequestMutation.mutate();
  };
  
  const handleSendMessage = () => {
    customerMessageMutation.mutate();
  };
  
  useEffect(() => {
    if (order && order.status === "waiting" && !hasRegistered && !registerMutation.isPending) {
      registerMutation.mutate();
    }
  }, [order, hasRegistered]);
  
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);
  
  useEffect(() => {
    if (!orderId) return;
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const clientId = localStorage.getItem(`ws_client_${orderId}_clientId`) || undefined;
    const lastTimestamp = localStorage.getItem(`ws_client_${orderId}_timestamp`) || '0';
    
    const params = new URLSearchParams({
      id: orderId,
      ...(clientId && { clientId }),
      lastTimestamp
    });
    const wsUrl = `${protocol}//${window.location.host}/ws/orders?${params}`;
    
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    const INITIAL_BACKOFF = 1000;
    const MAX_BACKOFF = 30000;
    
    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
          console.log("[WS] Connected to order updates");
          reconnectAttempts = 0;
        };
        
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log("[WS] Received:", message);
            
            if (message.type === "ping") {
              ws?.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
              return;
            }
            
            if (message.type === "connected" && message.clientId) {
              localStorage.setItem(`ws_client_${orderId}_clientId`, message.clientId);
              if (message.serverTimestamp) {
                localStorage.setItem(`ws_client_${orderId}_timestamp`, message.serverTimestamp.toString());
              }
              return;
            }
            
            if (message.type === "sync_response" && message.order) {
              queryClient.setQueryData(["/api/orders", orderId], message.order);
              if (message.serverTimestamp) {
                localStorage.setItem(`ws_client_${orderId}_timestamp`, message.serverTimestamp.toString());
              }
              return;
            }
            
            if (message.type === "order_updated") {
              if (message.serverTimestamp) {
                localStorage.setItem(`ws_client_${orderId}_timestamp`, message.serverTimestamp.toString());
              }
              const eventType = message.eventType as 'order_ready' | 'message' | 'offer' | 'status_update';
              if (eventType) {
                console.log(`[WS] Playing sound for event: ${eventType}`);
                playSound(eventType);
                
                if (navigator.vibrate && eventType === 'order_ready') {
                  navigator.vibrate([200, 100, 200, 100, 200]);
                }
              }
              queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
            }
          } catch (e) {
            console.warn("[WS] Failed to parse message:", e);
          }
        };
        
        ws.onclose = () => {
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const backoff = Math.min(INITIAL_BACKOFF * Math.pow(2, reconnectAttempts), MAX_BACKOFF);
            reconnectAttempts++;
            console.log(`[WS] Reconnecting in ${backoff}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
            reconnectTimeout = setTimeout(connect, backoff);
          } else {
            console.log("[WS] Max reconnect attempts reached");
          }
        };
        
        ws.onerror = () => {
          console.error("[WS] WebSocket error");
          ws?.close();
        };
      } catch (error) {
        console.error("[WS] Failed to connect:", error);
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const backoff = Math.min(INITIAL_BACKOFF * Math.pow(2, reconnectAttempts), MAX_BACKOFF);
          reconnectAttempts++;
          reconnectTimeout = setTimeout(connect, backoff);
        }
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("[WS] Page became visible, checking connection");
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          reconnectAttempts = 0;
          connect();
        } else {
          ws.send(JSON.stringify({
            type: 'sync_request',
            lastTimestamp: parseInt(localStorage.getItem(`ws_client_${orderId}_timestamp`) || '0', 10)
          }));
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    connect();
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [orderId, playSound]);
  
  if (isLoading) {
    return <LoadingState />;
  }
  
  if (error || !order) {
    return <OrderNotFound />;
  }
  
  return (
    <>
      {!audioUnlocked && <AudioUnlockOverlay onUnlock={handleAudioUnlock} />}
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2 relative">
          <div className="flex items-center justify-center gap-2">
            <Badge variant="outline" className="font-mono text-sm px-3 py-1" data-testid="badge-order-id">
              Order #{order.id}
            </Badge>
            {hasNewMessage && (
              <div 
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium animate-pulse-glow"
                data-testid="indicator-new-message"
              >
                <Bell className="h-3 w-3" />
                <span>New</span>
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold">Your Order Status</h1>
          <p className="text-muted-foreground">
            {formatTime(order.createdAt)} • Track your order here
          </p>
        </div>
        
        <SubscribedCard order={order} onRequestService={handleRequestService} isRequestingService={serviceRequestMutation.isPending} />
        
        {order.messages.length > 0 && (
          <Card ref={messagesCardRef}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Send className="h-4 w-4" />
                Messages ({order.messages.length})
                {hasNewMessage && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[...order.messages].reverse().map((msg, index) => (
                  <div 
                    key={msg.id} 
                    className={`border-l-2 pl-3 py-2 transition-all duration-500 ${
                      msg.id === newMessageId && hasNewMessage 
                        ? "border-primary bg-primary/5 animate-fade-in-highlight" 
                        : "border-primary/50"
                    }`}
                    data-testid={`message-item-${msg.id}`}
                  >
                    <p className="text-sm text-foreground">{msg.text}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatTime(msg.sentAt)}
                      {index === 0 && <span className="ml-2 text-primary font-medium">Latest</span>}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {order.offers.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Gift className="h-4 w-4" />
                Special Offers ({order.offers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {order.offers.map((offer) => (
                  <div key={offer.id} className="border-l-2 border-amber-500 pl-3 py-2" data-testid={`offer-item-${offer.id}`}>
                    <p className="font-medium text-sm text-foreground">{offer.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{offer.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatTime(offer.createdAt)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {pushEnabled && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Send Message to Staff
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="text"
                placeholder="Ask staff something..."
                value={customerMessage}
                onChange={(e) => setCustomerMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customerMessage.trim() && !customerMessageMutation.isPending) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={customerMessageMutation.isPending}
                data-testid="input-customer-message"
                maxLength={200}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!customerMessage.trim() || customerMessageMutation.isPending}
                className="w-full"
                data-testid="button-send-message"
              >
                {customerMessageMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send to Staff
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}
        
        <div className={`flex items-center justify-center gap-2 text-xs flex-wrap ${!audioUnlocked ? 'text-amber-600' : 'text-muted-foreground'}`}>
          {!audioUnlocked ? (
            <>
              <VolumeX className="h-3 w-3" />
              <span className="font-medium">Audio activation required</span>
            </>
          ) : (
            <>
              <Volume2 className="h-3 w-3 text-green-600" />
              <span className="text-green-600">Sound alerts active</span>
            </>
          )}
          {pushEnabled ? (
            <>
              <span>•</span>
              <Bell className="h-3 w-3 text-green-600" />
              <span className="text-green-600">Push enabled</span>
            </>
          ) : (
            <>
              <span>•</span>
              <Bell className="h-3 w-3" />
              <span className="text-muted-foreground">Push disabled</span>
            </>
          )}
        </div>
        
        <p className="text-center text-xs text-muted-foreground px-4">
          Keep this page open to receive alerts when your order is ready
        </p>
        </div>
      </div>
    </>
  );
}
