import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Order } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Bell, 
  BellRing, 
  Check, 
  Clock, 
  Loader2, 
  AlertCircle,
  CheckCircle2,
  Calendar,
  Smartphone,
  Send,
  Gift
} from "lucide-react";

function getStatusConfig(status: Order["status"]) {
  switch (status) {
    case "waiting":
      return {
        icon: Clock,
        title: "Waiting for Subscription",
        description: "Enable notifications to know when your order is ready",
        color: "text-muted-foreground"
      };
    case "subscribed":
      return {
        icon: BellRing,
        title: "Notifications Enabled",
        description: "We'll notify you when your order is ready",
        color: "text-primary"
      };
    case "scheduled":
      return {
        icon: Calendar,
        title: "Order In Progress",
        description: "Your order is being prepared. You'll be notified soon!",
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

function playReadySound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audioContext.currentTime;
    
    // Create oscillators for a pleasant alert sound
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc1.frequency.value = 800;
    osc2.frequency.value = 600;
    osc1.type = "sine";
    osc2.type = "sine";
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioContext.destination);
    
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.3);
    osc2.stop(now + 0.3);
  } catch (error) {
    console.error("Failed to play sound:", error);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeToPush(orderId: string): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.error("Push notifications not supported");
    return null;
  }
  
  try {
    const registration = await navigator.serviceWorker.ready;
    
    const response = await fetch("/api/vapid-public-key");
    const { publicKey } = await response.json();
    
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });
    
    return subscription;
  } catch (error) {
    console.error("Failed to subscribe to push:", error);
    return null;
  }
}

function NotificationPermissionCard({ onEnable, isPending }: { onEnable: () => void; isPending: boolean }) {
  const [permissionState, setPermissionState] = useState<NotificationPermission | "unknown">("unknown");
  
  useEffect(() => {
    if ("Notification" in window) {
      setPermissionState(Notification.permission);
    }
  }, []);
  
  if (permissionState === "denied") {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Notifications Blocked</h3>
              <p className="text-sm text-muted-foreground">
                Please enable notifications in your browser settings to receive order updates
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="hover-elevate">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
            <Bell className="h-10 w-10 text-primary" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Get Notified When Ready</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Enable push notifications to receive an alert when your order is ready for pickup
            </p>
          </div>
          
          <Button 
            size="lg" 
            onClick={onEnable}
            disabled={isPending}
            className="w-full max-w-xs"
            data-testid="button-enable-notifications"
          >
            {isPending ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Bell className="h-5 w-5 mr-2" />
            )}
            Enable Notifications
          </Button>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Smartphone className="h-4 w-4" />
            <span>Works on mobile and desktop</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SubscribedCard({ order, onRequestService, isRequestingService }: { order: Order; onRequestService: () => void; isRequestingService: boolean }) {
  const statusConfig = getStatusConfig(order.status);
  const StatusIcon = statusConfig.icon;
  const [remainingTime, setRemainingTime] = useState<string>("");
  
  useEffect(() => {
    if (!order.scheduledTime || order.status !== "scheduled") return;
    
    setRemainingTime(formatRemainingTime(order.scheduledTime));
    
    const interval = setInterval(() => {
      setRemainingTime(formatRemainingTime(order.scheduledTime));
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
            <span>Notifications are enabled</span>
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
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  
  const { data: order, isLoading, error } = useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    enabled: !!orderId,
    refetchInterval: 4000
  });
  
  const subscribeMutation = useMutation({
    mutationFn: async (subscription: PushSubscription) => {
      const subData = subscription.toJSON();
      return apiRequest("POST", `/api/orders/${orderId}/subscribe`, {
        subscription: {
          endpoint: subData.endpoint,
          keys: {
            p256dh: subData.keys?.p256dh,
            auth: subData.keys?.auth
          }
        }
      });
    },
    onSuccess: () => {
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
  
  const handleEnableNotifications = async () => {
    if (!orderId) return;
    
    const subscription = await subscribeToPush(orderId);
    if (subscription) {
      subscribeMutation.mutate(subscription);
    }
  };
  
  const handleRequestService = () => {
    serviceRequestMutation.mutate();
  };
  
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);
  
  useEffect(() => {
    if (!orderId) return;
    
    // Connect to WebSocket for real-time updates
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/orders?id=${orderId}`;
    
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    
    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
          console.log("Connected to order updates");
        };
        
        ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          if (message.type === "order_updated") {
            // Play audio alert when order is updated
            playReadySound();
            // Refetch the order data immediately
            queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
          }
        };
        
        ws.onclose = () => {
          // Attempt to reconnect after 3 seconds
          reconnectTimeout = setTimeout(connect, 3000);
        };
        
        ws.onerror = () => {
          console.error("WebSocket error");
          ws?.close();
        };
      } catch (error) {
        console.error("Failed to connect to WebSocket:", error);
        reconnectTimeout = setTimeout(connect, 3000);
      }
    };
    
    connect();
    
    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [orderId]);
  
  if (isLoading) {
    return <LoadingState />;
  }
  
  if (error || !order) {
    return <OrderNotFound />;
  }
  
  const showSubscriptionCard = order.status === "waiting";
  
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <Badge variant="outline" className="font-mono text-sm px-3 py-1" data-testid="badge-order-id">
            Order #{order.id}
          </Badge>
          <h1 className="text-2xl font-bold">Your Order Status</h1>
          <p className="text-muted-foreground">
            {formatTime(order.createdAt)} • Track your order here
          </p>
        </div>
        
        {showSubscriptionCard ? (
          <NotificationPermissionCard 
            onEnable={handleEnableNotifications}
            isPending={subscribeMutation.isPending}
          />
        ) : (
          <SubscribedCard order={order} onRequestService={handleRequestService} isRequestingService={serviceRequestMutation.isPending} />
        )}
        
        {order.messages.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Send className="h-4 w-4" />
                Messages ({order.messages.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {order.messages.map((msg) => (
                  <div key={msg.id} className="border-l-2 border-primary pl-3 py-2" data-testid={`message-item-${msg.id}`}>
                    <p className="text-sm text-foreground">{msg.text}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatTime(msg.sentAt)}</p>
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
        
        <p className="text-center text-xs text-muted-foreground px-4">
          Keep this page open or save this link to check your order status anytime
        </p>
      </div>
    </div>
  );
}
