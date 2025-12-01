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
  Smartphone
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

function SubscribedCard({ order }: { order: Order }) {
  const statusConfig = getStatusConfig(order.status);
  const StatusIcon = statusConfig.icon;
  
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
            <div className="flex items-center gap-2 text-sm bg-muted/50 rounded-lg px-4 py-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>Estimated: {formatTime(order.scheduledTime)}</span>
            </div>
          )}
          
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
            <Check className="h-4 w-4" />
            <span>Notifications are enabled</span>
          </div>
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
    enabled: !!orderId
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
  
  const handleEnableNotifications = async () => {
    if (!orderId) return;
    
    const subscription = await subscribeToPush(orderId);
    if (subscription) {
      subscribeMutation.mutate(subscription);
    }
  };
  
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);
  
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
          <SubscribedCard order={order} />
        )}
        
        <p className="text-center text-xs text-muted-foreground px-4">
          Keep this page open or save this link to check your order status anytime
        </p>
      </div>
    </div>
  );
}
