import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Order } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Plus, 
  Bell, 
  Clock, 
  QrCode, 
  Copy, 
  Check, 
  Trash2, 
  Send, 
  Calendar,
  RefreshCw,
  Users,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import QRCode from "qrcode";

function getStatusBadgeVariant(status: Order["status"]): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "waiting":
      return "outline";
    case "subscribed":
      return "secondary";
    case "scheduled":
      return "default";
    case "notified":
    case "completed":
      return "default";
    default:
      return "outline";
  }
}

function getStatusIcon(status: Order["status"]) {
  switch (status) {
    case "waiting":
      return <Clock className="h-3 w-3" />;
    case "subscribed":
      return <Bell className="h-3 w-3" />;
    case "scheduled":
      return <Calendar className="h-3 w-3" />;
    case "notified":
    case "completed":
      return <CheckCircle2 className="h-3 w-3" />;
    default:
      return <AlertCircle className="h-3 w-3" />;
  }
}

function formatTime(isoString: string) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(isoString: string) {
  const date = new Date(isoString);
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function OrderCard({ 
  order, 
  onShowQR, 
  onTrigger, 
  onSchedule, 
  onDelete 
}: { 
  order: Order; 
  onShowQR: (order: Order) => void;
  onTrigger: (orderId: string) => void;
  onSchedule: (orderId: string) => void;
  onDelete: (orderId: string) => void;
}) {
  const canNotify = order.subscription || order.status === "subscribed" || order.status === "scheduled" || order.status === "notified" || order.status === "completed";
  
  return (
    <Card className="hover-elevate transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="font-mono text-lg tracking-wide" data-testid={`text-order-id-${order.id}`}>
              #{order.id}
            </CardTitle>
            <CardDescription className="text-sm">
              {formatDate(order.createdAt)} at {formatTime(order.createdAt)}
            </CardDescription>
          </div>
          <Badge 
            variant={getStatusBadgeVariant(order.status)} 
            className="flex items-center gap-1 capitalize"
            data-testid={`badge-status-${order.id}`}
          >
            {getStatusIcon(order.status)}
            {order.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {order.scheduledTime && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            <Clock className="h-4 w-4" />
            <span>Scheduled for {formatTime(order.scheduledTime)}</span>
          </div>
        )}
        
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => onShowQR(order)}
            data-testid={`button-qr-${order.id}`}
          >
            <QrCode className="h-4 w-4 mr-1" />
            QR Code
          </Button>
          
          {canNotify && (
            <>
              <Button 
                size="sm" 
                onClick={() => onTrigger(order.id)}
                data-testid={`button-notify-${order.id}`}
              >
                <Send className="h-4 w-4 mr-1" />
                Notify Now
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onSchedule(order.id)}
                data-testid={`button-schedule-${order.id}`}
              >
                <Calendar className="h-4 w-4 mr-1" />
                Schedule
              </Button>
            </>
          )}
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="ml-auto text-muted-foreground"
            onClick={() => onDelete(order.id)}
            data-testid={`button-delete-${order.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function QRCodeModal({ 
  order, 
  open, 
  onClose 
}: { 
  order: Order | null; 
  open: boolean; 
  onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  
  const orderUrl = order ? `${window.location.origin}/order/${order.id}` : "";
  
  useEffect(() => {
    if (order && orderUrl) {
      QRCode.toDataURL(orderUrl, { 
        width: 300, 
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" }
      }).then(setQrDataUrl);
    }
  }, [order, orderUrl]);
  
  const copyLink = async () => {
    await navigator.clipboard.writeText(orderUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  if (!order) return null;
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Order #{order.id}</DialogTitle>
          <DialogDescription className="text-center">
            Share this QR code with your customer
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-6 py-4">
          <div className="bg-white p-4 rounded-lg">
            {qrDataUrl ? (
              <img 
                src={qrDataUrl} 
                alt={`QR code for order ${order.id}`}
                className="w-64 h-64"
                data-testid="img-qrcode"
              />
            ) : (
              <Skeleton className="w-64 h-64" />
            )}
          </div>
          
          <div className="flex items-center gap-2 w-full">
            <Input 
              value={orderUrl} 
              readOnly 
              className="font-mono text-sm"
              data-testid="input-order-url"
            />
            <Button 
              variant="outline" 
              size="icon" 
              onClick={copyLink}
              data-testid="button-copy-link"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          
          <p className="text-sm text-muted-foreground text-center">
            Customer scans this code to receive notifications when their order is ready
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NotifyModal({
  orderId,
  open,
  onClose,
  onNotify
}: {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  onNotify: (orderId: string, message: string) => void;
}) {
  const [message, setMessage] = useState("");
  
  const handleSubmit = () => {
    if (orderId) {
      onNotify(orderId, message || "Your order is ready for pickup!");
      onClose();
      setMessage("");
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Notification</DialogTitle>
          <DialogDescription>
            Enter a custom message for the customer
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="notification-message">Message</Label>
            <Input
              id="notification-message"
              placeholder="Your order is ready for pickup!"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              data-testid="input-notification-message"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              {message.length}/100 characters
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} data-testid="button-confirm-notify">
              <Send className="h-4 w-4 mr-1" />
              Send Notification
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleModal({
  orderId,
  open,
  onClose,
  onSchedule
}: {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  onSchedule: (orderId: string, time: string, message: string) => void;
}) {
  const [scheduledTime, setScheduledTime] = useState("");
  const [message, setMessage] = useState("");
  
  const handleSubmit = () => {
    if (orderId && scheduledTime) {
      // Convert local datetime to ISO string for backend
      // datetime-local input returns "2025-12-01T21:00"
      // We need to convert it to proper ISO format
      const localDate = new Date(scheduledTime);
      const isoString = localDate.toISOString();
      
      onSchedule(orderId, isoString, message || "Your order is ready for pickup!");
      onClose();
      setScheduledTime("");
      setMessage("");
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Notification</DialogTitle>
          <DialogDescription>
            Set when the customer should be notified
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="scheduled-time">Notification Time</Label>
            <Input
              id="scheduled-time"
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              data-testid="input-scheduled-time"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule-message">Message (optional)</Label>
            <Input
              id="schedule-message"
              placeholder="Your order is ready for pickup!"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              data-testid="input-schedule-message"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              {message.length}/100 characters
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!scheduledTime} data-testid="button-confirm-schedule">
              <Calendar className="h-4 w-4 mr-1" />
              Schedule
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ onCreateOrder }: { onCreateOrder: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <Users className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold mb-2">No orders yet</h3>
      <p className="text-muted-foreground mb-6 max-w-sm">
        Create your first order to generate a QR code that customers can scan to receive notifications
      </p>
      <Button onClick={onCreateOrder} size="lg" data-testid="button-create-first-order">
        <Plus className="h-5 w-5 mr-2" />
        Create First Order
      </Button>
    </div>
  );
}

function OrdersSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-5 w-20" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const { toast } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [notifyOrderId, setNotifyOrderId] = useState<string | null>(null);
  const [scheduleOrderId, setScheduleOrderId] = useState<string | null>(null);
  
  const { data: orders, isLoading, refetch } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    refetchInterval: 4000
  });
  
  const createOrderMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/orders"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order created",
        description: "New order has been created successfully"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create order",
        variant: "destructive"
      });
    }
  });
  
  const deleteOrderMutation = useMutation({
    mutationFn: (orderId: string) => apiRequest("DELETE", `/api/orders/${orderId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order deleted",
        description: "Order has been removed"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete order",
        variant: "destructive"
      });
    }
  });
  
  const triggerMutation = useMutation({
    mutationFn: ({ orderId, message }: { orderId: string; message: string }) => 
      apiRequest("POST", `/api/orders/${orderId}/trigger`, { message }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Notification sent",
        description: "Customer has been notified"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send notification. Make sure the customer has subscribed.",
        variant: "destructive"
      });
    }
  });
  
  const scheduleMutation = useMutation({
    mutationFn: ({ orderId, scheduledTime, message }: { orderId: string; scheduledTime: string; message: string }) => 
      apiRequest("POST", `/api/orders/${orderId}/schedule`, { scheduledTime, message }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Notification scheduled",
        description: "Customer will be notified at the scheduled time"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to schedule notification",
        variant: "destructive"
      });
    }
  });
  
  const handleCreateOrder = () => {
    createOrderMutation.mutate();
  };
  
  const handleNotify = (orderId: string, message: string) => {
    triggerMutation.mutate({ orderId, message });
  };
  
  const handleSchedule = (orderId: string, scheduledTime: string, message: string) => {
    scheduleMutation.mutate({ orderId, scheduledTime, message });
  };
  
  const activeOrders = orders?.filter(o => o.status !== "completed") ?? [];
  const completedOrders = orders?.filter(o => o.status === "completed") ?? [];
  
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between gap-4 px-4 mx-auto max-w-6xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Bell className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold">Restaurant Buzzer</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => refetch()}
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button 
              onClick={handleCreateOrder}
              disabled={createOrderMutation.isPending}
              data-testid="button-create-order"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Order
            </Button>
          </div>
        </div>
      </header>
      
      <main className="container px-4 py-8 mx-auto max-w-6xl">
        <Tabs defaultValue="active" className="space-y-6">
          <TabsList>
            <TabsTrigger value="active" data-testid="tab-active-orders">
              Active Orders
              {activeOrders.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeOrders.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed-orders">
              Completed
              {completedOrders.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {completedOrders.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="active" className="space-y-6">
            {isLoading ? (
              <OrdersSkeleton />
            ) : activeOrders.length === 0 ? (
              <EmptyState onCreateOrder={handleCreateOrder} />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onShowQR={setSelectedOrder}
                    onTrigger={setNotifyOrderId}
                    onSchedule={setScheduleOrderId}
                    onDelete={(id) => deleteOrderMutation.mutate(id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="completed" className="space-y-6">
            {completedOrders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No completed orders yet
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {completedOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onShowQR={setSelectedOrder}
                    onTrigger={setNotifyOrderId}
                    onSchedule={setScheduleOrderId}
                    onDelete={(id) => deleteOrderMutation.mutate(id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
      
      <QRCodeModal
        order={selectedOrder}
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
      
      <NotifyModal
        orderId={notifyOrderId}
        open={!!notifyOrderId}
        onClose={() => setNotifyOrderId(null)}
        onNotify={handleNotify}
      />
      
      <ScheduleModal
        orderId={scheduleOrderId}
        open={!!scheduleOrderId}
        onClose={() => setScheduleOrderId(null)}
        onSchedule={handleSchedule}
      />
    </div>
  );
}
