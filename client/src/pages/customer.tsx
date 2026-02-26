import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { audioManager } from "@/lib/audio-manager";
import { offlineStorage } from "@/lib/indexed-db-storage";
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
  Bell,
  Volume2,
  VolumeX,
  MessageSquare,
} from "lucide-react";

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
            <h3 className="text-xl font-semibold">{statusConfig.title}</h3>
            <p className="text-muted-foreground">{statusConfig.description}</p>
          </div>
          
          {order.scheduledTime && order.status === "scheduled" && (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 text-lg font-semibold text-primary bg-primary/10 rounded-lg px-4 py-3 w-full">
                <Clock className="h-5 w-5" />
                <span>{remainingTime}</span>
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
          >
            {isRequestingService ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <AlertCircle className="h-5 w-5 mr-2" />}
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
  const [hasRegistered, setHasRegistered] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(() => audioManager.isUnlocked);
  const [pushEnabled, setPushEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return Notification.permission === 'granted';
    }
    return false;
  });
  const [cachedOrder, setCachedOrder] = useState<Order | null>(null);
  const [customerMessage, setCustomerMessage] = useState("");

  const playBuzzer = useCallback(() => {
    try {
      const ctx = audioManager.getContext();
      if (!ctx) {
        console.warn('[Audio] No context available for buzzer');
        return;
      }
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      // Spec: 800 Hz square wave for 800 ms at gain level 0.3
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
      console.log('[Audio] Synthetic 800Hz buzzer played');
    } catch (e) {
      console.warn('[Audio] Synthetic buzzer failed:', e);
    }
  }, []);

  const subscribeToPushSilent = async () => {
    if (!orderId) return;
    try {
      const vapidResponse = await fetch("/api/vapid-public-key");
      const { publicKey } = await vapidResponse.json();
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
      await apiRequest("POST", `/api/orders/${orderId}/subscribe`, {
        subscription: subscription.toJSON()
      });
      setPushEnabled(true);
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    } catch (error) {
      console.error('[Push] Silent subscription failed:', error);
    }
  };

  const autoEnableNotifications = useCallback(async () => {
    console.log('[AutoEnable] Initializing notifications and audio context...');
    try {
      const success = await audioManager.unlock();
      if (success) {
        setAudioUnlocked(true);
        // Play tone immediately to confirm audio path is open
        playBuzzer();
      }
    } catch (e) {
      console.warn('[AutoEnable] Audio unlock failed:', e);
    }
    
    if ("Notification" in window && "serviceWorker" in navigator && orderId) {
      try {
        let permission = Notification.permission;
        if (permission !== "granted") {
          permission = await Notification.requestPermission();
        }
        if (permission === "granted") {
          subscribeToPushSilent();
        }
      } catch (e) {
        console.warn('[AutoEnable] Push permission failed:', e);
      }
    }
  }, [orderId, playBuzzer]);

  // Global interaction listener to ensure AudioContext is warmed up even if they don't click the specific button
  useEffect(() => {
    const handleFirstInteraction = () => {
      autoEnableNotifications();
      ['touchstart', 'click', 'pointerdown', 'mousedown', 'keydown'].forEach(evt => {
        document.removeEventListener(evt, handleFirstInteraction);
      });
    };
    ['touchstart', 'click', 'pointerdown', 'mousedown', 'keydown'].forEach(evt => {
      document.addEventListener(evt, handleFirstInteraction, { once: true, passive: true });
    });
    return () => {
      ['touchstart', 'click', 'pointerdown', 'mousedown', 'keydown'].forEach(evt => {
        document.removeEventListener(evt, handleFirstInteraction);
      });
    };
  }, [autoEnableNotifications]);

  useEffect(() => {
    const unsubscribe = audioManager.onUnlockChange(setAudioUnlocked);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!orderId) return;
    offlineStorage.getOrder(orderId).then(cached => {
      if (cached) setCachedOrder(cached);
    });
  }, [orderId]);

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    enabled: !!orderId,
    refetchInterval: 4000,
    initialData: cachedOrder || undefined
  });

  useEffect(() => {
    if (order && orderId) {
      offlineStorage.saveOrder(order).catch(console.warn);
    }
  }, [order, orderId]);

  // Listen for Service Worker messages (triggered by push notifications)
  useEffect(() => {
    if (!navigator.serviceWorker) return;
    const handleSwMessage = (event: MessageEvent) => {
      console.log('[SW Message] Received:', event.data);
      if (event.data?.type === 'ORDER_READY') {
        console.log('[SW Message] ORDER_READY - playing synthetic buzzer');
        playBuzzer();
        queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [orderId, playBuzzer]);

  const registerMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/orders/${orderId}/register`),
    onSuccess: () => {
      setHasRegistered(true);
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    }
  });

  const serviceRequestMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/orders/${orderId}/service`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] })
  });

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

  useEffect(() => {
    if (order && order.status === "waiting" && !hasRegistered && !registerMutation.isPending) {
      registerMutation.mutate();
    }
  }, [order, hasRegistered, registerMutation]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);

  if (isLoading && !order) return <LoadingState />;
  if (!order) return <OrderNotFound />;

  const isSetupComplete = pushEnabled && audioUnlocked;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2 relative">
          <div className="flex items-center justify-center gap-2">
            <Badge variant="outline" className="font-mono text-sm px-3 py-1">
              Order #{order.id.slice(0, 8).toUpperCase()}
            </Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Digital Buzzer</h1>
          <p className="text-muted-foreground">You will be notified via sound and push when your order is ready.</p>
        </div>

        {!isSetupComplete && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
                <Bell className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold">Setup Notifications</h3>
                <p className="text-sm text-muted-foreground">Tap below to ensure you receive sound and push alerts.</p>
              </div>
              <Button 
                onClick={autoEnableNotifications}
                className="w-full"
                size="lg"
              >
                Enable Notifications
              </Button>
            </CardContent>
          </Card>
        )}

        <SubscribedCard 
          order={order} 
          onRequestService={() => serviceRequestMutation.mutate()} 
          isRequestingService={serviceRequestMutation.isPending} 
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Message Staff
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="text"
              placeholder="Type your message..."
              value={customerMessage}
              onChange={(e) => setCustomerMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customerMessage.trim() && !customerMessageMutation.isPending) {
                  customerMessageMutation.mutate();
                }
              }}
              disabled={customerMessageMutation.isPending}
              maxLength={200}
            />
            <Button
              onClick={() => customerMessageMutation.mutate()}
              disabled={!customerMessage.trim() || customerMessageMutation.isPending}
              className="w-full"
            >
              {customerMessageMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send to Staff
            </Button>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            {audioUnlocked ? <Volume2 className="h-3 w-3 text-green-600" /> : <VolumeX className="h-3 w-3 text-amber-600" />}
            <span className={audioUnlocked ? "text-green-600" : "text-amber-600"}>
              {audioUnlocked ? "Audio Ready" : "Audio Suspended"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Bell className={`h-3 w-3 ${pushEnabled ? "text-green-600" : "text-muted-foreground"}`} />
            <span className={pushEnabled ? "text-green-600" : "text-muted-foreground"}>
              {pushEnabled ? "Push Enabled" : "Push Inactive"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
