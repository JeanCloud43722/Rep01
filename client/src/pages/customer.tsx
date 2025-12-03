import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useNotificationOrchestrator } from "@/lib/notification-orchestrator";
import type { Order } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Smartphone,
  Volume2
} from "lucide-react";

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
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [hasRegistered, setHasRegistered] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [newMessageId, setNewMessageId] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const lastMessageCountRef = useRef<number>(0);
  const messagesCardRef = useRef<HTMLDivElement>(null);
  
  const { warmUp, notify, setRole, getCapabilities, getDeviceInfo, getCapabilitySummary, requestWakeLock } = useNotificationOrchestrator();
  
  const { data: order, isLoading, error } = useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    enabled: !!orderId,
    refetchInterval: 4000
  });
  
  // Set role and initialize orchestrator
  useEffect(() => {
    setRole('customer');
  }, []);
  
  // Enable audio with user interaction - required for iOS Safari
  const enableAudio = () => {
    warmUp();
    setAudioEnabled(true);
    requestWakeLock();
  };
  
  // Track new messages and trigger animation
  useEffect(() => {
    if (order && order.messages.length > lastMessageCountRef.current) {
      // New message(s) received
      if (lastMessageCountRef.current > 0) {
        setHasNewMessage(true);
        // Get the newest message ID for highlighting
        const newestMessage = order.messages[order.messages.length - 1];
        if (newestMessage) {
          setNewMessageId(newestMessage.id);
        }
      }
      lastMessageCountRef.current = order.messages.length;
    }
  }, [order?.messages.length]);
  
  // Reset animation when user scrolls to messages section
  useEffect(() => {
    if (!hasNewMessage || !messagesCardRef.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          // User can see the messages, reset indicator after a short delay
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
  
  // Auto-register customer when they visit the page (no button click needed)
  const registerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/orders/${orderId}/register`);
    },
    onSuccess: () => {
      setHasRegistered(true);
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
  
  const handleRequestService = () => {
    serviceRequestMutation.mutate();
  };
  
  // Auto-register when order is loaded and still in "waiting" status
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
            // Use notification orchestrator for audio/haptic/visual feedback
            const eventType = message.eventType as 'order_ready' | 'message' | 'offer' | 'status_update';
            if (eventType) {
              notify({
                type: eventType,
                orderId: orderId,
                title: message.title,
                body: message.body
              });
            }
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
  
  return (
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
        
        {/* Enable Sound button for iOS Safari and other devices that require user interaction */}
        {!audioEnabled && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Volume2 className="h-4 w-4 text-primary" />
                  <span>Enable sound alerts for notifications</span>
                </div>
                <Button 
                  onClick={enableAudio}
                  variant="default"
                  size="sm"
                  data-testid="button-enable-audio"
                >
                  <Volume2 className="h-4 w-4 mr-2" />
                  Enable Sound
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Tap to receive audio alerts when your order is ready
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        
        {audioEnabled && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Smartphone className="h-3 w-3" />
            <span>{getDeviceInfo()}</span>
            <span>•</span>
            <span>{getCapabilitySummary().join(', ')}</span>
          </div>
        )}
        
        <p className="text-center text-xs text-muted-foreground px-4">
          Keep this page open or save this link to check your order status anytime
        </p>
      </div>
    </div>
  );
}
