import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { audioManager } from "@/lib/audio-manager";
import type { Order } from "@shared/schema";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Volume2 } from "lucide-react";
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
  AlertCircle,
  Gift,
  Wrench,
  Edit,
  MessageSquare
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
  onDelete,
  onAddOffer,
  onEditNotes,
  onSendMessage
}: { 
  order: Order; 
  onShowQR: (order: Order) => void;
  onTrigger: (orderId: string) => void;
  onSchedule: (orderId: string) => void;
  onDelete: (orderId: string) => void;
  onAddOffer: (orderId: string) => void;
  onEditNotes: (orderId: string) => void;
  onSendMessage: (orderId: string) => void;
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
        {order.serviceRequests.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 border border-destructive/30">
            <Wrench className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">Service Requested ({order.serviceRequests.length})</span>
          </div>
        )}

        {order.messages.length > 0 && (
          <div className="text-sm bg-muted/50 rounded-md px-3 py-2 space-y-2">
            <p className="font-medium text-xs text-muted-foreground">Messages ({order.messages.length})</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {[...order.messages].reverse().slice(0, 3).map((msg) => (
                <p key={msg.id} className="text-foreground text-xs break-words">
                  <span className="text-muted-foreground">{formatTime(msg.sentAt)}</span>: {msg.text}
                </p>
              ))}
            </div>
          </div>
        )}

        {order.notes && (
          <div className="flex items-start gap-2 text-sm bg-muted/50 rounded-md px-3 py-2">
            <FileText className="h-4 w-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-foreground break-words">{order.notes}</p>
            </div>
          </div>
        )}
        
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
                onClick={() => onSendMessage(order.id)}
                data-testid={`button-message-${order.id}`}
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Message
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
            variant="outline" 
            size="sm" 
            onClick={() => onAddOffer(order.id)}
            data-testid={`button-add-offer-${order.id}`}
          >
            <Gift className="h-4 w-4 mr-1" />
            Offer
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => onEditNotes(order.id)}
            data-testid={`button-edit-notes-${order.id}`}
          >
            <Edit className="h-4 w-4 mr-1" />
            Notes
          </Button>
          
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

function AddOfferModal({
  orderId,
  open,
  onClose,
  onAddOffer
}: {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  onAddOffer: (orderId: string, title: string, description: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  
  const handleSubmit = () => {
    if (orderId && title.trim() && description.trim()) {
      onAddOffer(orderId, title, description);
      onClose();
      setTitle("");
      setDescription("");
    }
  };
  
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setTitle("");
      setDescription("");
    }
    onClose();
  };
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Offer</DialogTitle>
          <DialogDescription>
            Add an offer to display to the customer
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="offer-title">Offer Title</Label>
            <Input
              id="offer-title"
              placeholder="e.g., 20% Off Drinks"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-offer-title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="offer-description">Description</Label>
            <Input
              id="offer-description"
              placeholder="e.g., Valid today only"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="input-offer-description"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} data-testid="button-confirm-offer">
              <Gift className="h-4 w-4 mr-1" />
              Add Offer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NotesModal({
  orderId,
  open,
  onClose,
  onSaveNotes,
  initialNotes
}: {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  onSaveNotes: (orderId: string, notes: string) => void;
  initialNotes: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  
  const handleSubmit = () => {
    if (orderId) {
      onSaveNotes(orderId, notes);
      onClose();
    }
  };
  
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setNotes(initialNotes);
    }
    onClose();
  };

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes, open]);
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Notes</DialogTitle>
          <DialogDescription>
            Add a name, table number, or any notes for this order
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="order-notes">Notes (max 500 characters)</Label>
            <Textarea
              id="order-notes"
              placeholder="e.g., Table 5, John Smith"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              data-testid="input-order-notes"
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {notes.length}/500 characters
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} data-testid="button-confirm-notes">
              <FileText className="h-4 w-4 mr-1" />
              Save Notes
            </Button>
          </div>
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
  const DEFAULT_MESSAGE = "Your order is ready for pickup!";
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  
  const handleSubmit = () => {
    if (orderId) {
      onNotify(orderId, message);
      onClose();
      setMessage(DEFAULT_MESSAGE);
    }
  };
  
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setMessage(DEFAULT_MESSAGE);
    }
    onClose();
  };
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Notification</DialogTitle>
          <DialogDescription>
            Edit the message or send as is
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="notification-message">Message</Label>
            <Input
              id="notification-message"
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

function MessageModal({
  orderId,
  open,
  onClose,
  onSendMessage
}: {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  onSendMessage: (orderId: string, message: string) => void;
}) {
  const [message, setMessage] = useState("");
  
  const handleSubmit = () => {
    if (orderId && message.trim()) {
      onSendMessage(orderId, message);
      onClose();
      setMessage("");
    }
  };
  
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setMessage("");
    }
    onClose();
  };
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Message</DialogTitle>
          <DialogDescription>
            Send a custom message to the customer (without marking order as ready)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="custom-message">Message</Label>
            <Input
              id="custom-message"
              placeholder="e.g., Your order is almost ready..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              data-testid="input-custom-message"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              {message.length}/200 characters
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!message.trim()} data-testid="button-confirm-message">
              <MessageSquare className="h-4 w-4 mr-1" />
              Send Message
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
  const DEFAULT_MESSAGE = "Your order is ready for pickup!";
  const [scheduledTime, setScheduledTime] = useState("");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  
  const handleSubmit = () => {
    if (orderId && scheduledTime) {
      // Convert local datetime to ISO string for backend
      // datetime-local input returns "2025-12-01T21:00"
      // We need to convert it to proper ISO format
      const localDate = new Date(scheduledTime);
      const isoString = localDate.toISOString();
      
      onSchedule(orderId, isoString, message);
      onClose();
      setScheduledTime("");
      setMessage(DEFAULT_MESSAGE);
    }
  };
  
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setScheduledTime("");
      setMessage(DEFAULT_MESSAGE);
    }
    onClose();
  };
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            <Label htmlFor="schedule-message">Message</Label>
            <Input
              id="schedule-message"
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
  const [messageOrderId, setMessageOrderId] = useState<string | null>(null);
  const [scheduleOrderId, setScheduleOrderId] = useState<string | null>(null);
  const [offerOrderId, setOfferOrderId] = useState<string | null>(null);
  const [notesOrderId, setNotesOrderId] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioEnabledRef = useRef(false);
  
  const { data: orders, isLoading, refetch } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    refetchInterval: 4000
  });
  
  const playStaffSound = useCallback((type: 'service_request' | 'new_registration' | 'order_completed') => {
    console.log(`[Admin Audio] Playing sound for: ${type}, audioEnabled: ${audioEnabledRef.current}`);
    if (!audioEnabledRef.current) {
      console.log('[Admin Audio] Sound not enabled yet');
      return;
    }
    
    switch (type) {
      case 'service_request':
        audioManager.play('service-request');
        break;
      case 'new_registration':
        audioManager.play('new-registration');
        break;
      case 'order_completed':
        audioManager.play('order-completed');
        break;
    }
  }, []);
  
  const enableAudio = useCallback(() => {
    if (audioEnabledRef.current) return;
    console.log('[Admin Audio] Auto-enabling audio...');
    audioManager.warmUp();
    audioEnabledRef.current = true;
    setAudioEnabled(true);
  }, []);
  
  // Auto-enable audio on first interaction
  useEffect(() => {
    const handleInteraction = () => {
      enableAudio();
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('scroll', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
    
    document.addEventListener('touchstart', handleInteraction, { passive: true });
    document.addEventListener('click', handleInteraction);
    document.addEventListener('scroll', handleInteraction, { passive: true });
    document.addEventListener('keydown', handleInteraction);
    
    return () => {
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('scroll', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, [enableAudio]);
  
  // Connect to admin WebSocket for real-time service request alerts
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/admin`;
    
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
          console.log("[Admin WS] Connected to admin updates");
          reconnectAttempts = 0;
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
            
            console.log("[Admin WS] Received:", message);
            
            if (message.type === "admin_update") {
              const eventType = message.eventType as 'service_request' | 'new_registration' | 'order_completed';
              if (eventType) {
                console.log(`[Admin WS] Playing sound for event: ${eventType}`);
                playStaffSound(eventType);
                
                if (navigator.vibrate) {
                  navigator.vibrate([200, 100, 200]);
                }
              }
              
              if (message.eventType === "service_request") {
                toast({
                  title: "Service Request",
                  description: `Order ${message.orderId} needs assistance`,
                  variant: "destructive"
                });
              } else if (message.eventType === "new_registration") {
                toast({
                  title: "New Customer",
                  description: `Order ${message.orderId} customer arrived`,
                });
              }
              
              queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
            }
          } catch (e) {
            console.warn("[Admin WS] Failed to parse message:", e);
          }
        };
        
        ws.onclose = () => {
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const backoff = Math.min(INITIAL_BACKOFF * Math.pow(2, reconnectAttempts), MAX_BACKOFF);
            reconnectAttempts++;
            console.log(`[Admin WS] Reconnecting in ${backoff}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
            reconnectTimeout = setTimeout(connect, backoff);
          }
        };
        
        ws.onerror = () => {
          console.error("[Admin WS] WebSocket error");
          ws?.close();
        };
      } catch (error) {
        console.error("[Admin WS] Failed to connect:", error);
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const backoff = Math.min(INITIAL_BACKOFF * Math.pow(2, reconnectAttempts), MAX_BACKOFF);
          reconnectAttempts++;
          reconnectTimeout = setTimeout(connect, backoff);
        }
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (!ws || ws.readyState !== WebSocket.OPEN)) {
        console.log("[Admin WS] Page became visible, reconnecting...");
        reconnectAttempts = 0;
        connect();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    connect();
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [toast, audioEnabled, playStaffSound]);
  
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

  const messageMutation = useMutation({
    mutationFn: ({ orderId, message }: { orderId: string; message: string }) => 
      apiRequest("POST", `/api/orders/${orderId}/message`, { message }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Message sent",
        description: "Customer has received your message"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send message",
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

  const handleSendMessage = (orderId: string, message: string) => {
    messageMutation.mutate({ orderId, message });
  };

  const addOfferMutation = useMutation({
    mutationFn: async (data: { orderId: string; title: string; description: string }) => {
      return apiRequest("POST", `/api/orders/${data.orderId}/offers`, {
        title: data.title,
        description: data.description
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ description: "Offer added successfully" });
    },
    onError: () => {
      toast({ description: "Failed to add offer", variant: "destructive" });
    }
  });

  const handleAddOffer = (orderId: string, title: string, description: string) => {
    addOfferMutation.mutate({ orderId, title, description });
  };

  const updateNotesMutation = useMutation({
    mutationFn: async (data: { orderId: string; notes: string }) => {
      return apiRequest("PATCH", `/api/orders/${data.orderId}/notes`, {
        notes: data.notes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ description: "Notes updated successfully" });
    },
    onError: () => {
      toast({ description: "Failed to update notes", variant: "destructive" });
    }
  });

  const handleSaveNotes = (orderId: string, notes: string) => {
    updateNotesMutation.mutate({ orderId, notes });
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
            <Badge variant={audioEnabled ? "secondary" : "outline"} className="text-xs">
              <Volume2 className="h-3 w-3 mr-1" />
              {audioEnabled ? "Sound On" : "Tap to enable sound"}
            </Badge>
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
                    onAddOffer={setOfferOrderId}
                    onEditNotes={setNotesOrderId}
                    onSendMessage={setMessageOrderId}
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
                    onAddOffer={setOfferOrderId}
                    onEditNotes={setNotesOrderId}
                    onSendMessage={setMessageOrderId}
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

      <MessageModal
        orderId={messageOrderId}
        open={!!messageOrderId}
        onClose={() => setMessageOrderId(null)}
        onSendMessage={handleSendMessage}
      />
      
      <ScheduleModal
        orderId={scheduleOrderId}
        open={!!scheduleOrderId}
        onClose={() => setScheduleOrderId(null)}
        onSchedule={handleSchedule}
      />
      
      <AddOfferModal
        orderId={offerOrderId}
        open={!!offerOrderId}
        onClose={() => setOfferOrderId(null)}
        onAddOffer={handleAddOffer}
      />

      <NotesModal
        orderId={notesOrderId}
        open={!!notesOrderId}
        onClose={() => setNotesOrderId(null)}
        onSaveNotes={handleSaveNotes}
        initialNotes={orders?.find(o => o.id === notesOrderId)?.notes || ""}
      />
    </div>
  );
}
