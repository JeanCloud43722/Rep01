import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { audioManager } from "@/lib/audio-manager";
import { useAdminWebSocket } from "@/hooks/use-admin-websocket";
import { formatOrderId } from "@/lib/format-utils";
import type { Order } from "@shared/schema";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Volume2, VolumeX, LogOut, RotateCcw, Loader2, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  MessageSquare,
  ShoppingBag
} from "lucide-react";
import QRCode from "qrcode";

type OrderWithMeta = Order & { totalMessages: number };
type PaginatedOrdersResponse = { orders: OrderWithMeta[]; total: number; limit: number; offset: number };

interface OrderItemRow {
  id: number;
  productId: number;
  variantName: string | null;
  quantity: number;
  modifications: string | null;
  priceAtTime: string;
  createdAt: string;
  productName: string;
  productCategory: string;
}

const ACTIVE_STATUSES = "waiting,subscribed,scheduled,notified";

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

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}


function OrderCard({ 
  order, 
  onShowQR, 
  onTrigger, 
  onSchedule, 
  onDelete,
  onAddOffer,
  onEditNotes,
  onSendMessage,
  onComplete,
  onReactivate
}: { 
  order: Order; 
  onShowQR: (order: Order) => void;
  onTrigger: (orderId: string) => void;
  onSchedule: (orderId: string) => void;
  onDelete: (orderId: string) => void;
  onAddOffer: (orderId: string) => void;
  onEditNotes: (orderId: string) => void;
  onSendMessage: (orderId: string) => void;
  onComplete: (orderId: string) => void;
  onReactivate: (orderId: string, resetMessages: boolean) => void;
}) {
  const canNotify = order.subscription || order.status === "subscribed" || order.status === "scheduled" || order.status === "notified" || order.status === "completed";
  const { toast } = useToast();
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [resetMessages, setResetMessages] = useState(false);

  const { data: orderItemsData } = useQuery<{ order_items: OrderItemRow[] }>({
    queryKey: ["/api/orders", order.id, "order-items"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${order.id}/order-items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load order items");
      return res.json() as Promise<{ order_items: OrderItemRow[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const confirmedItems = orderItemsData?.order_items ?? [];

  const acknowledgeMutation = useMutation({
    mutationFn: ({ orderId, requestId }: { orderId: string; requestId: string }) =>
      apiRequest("POST", `/api/orders/${orderId}/service/${requestId}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Service request acknowledged" });
    },
    onError: () => {
      toast({ title: "Failed to acknowledge", variant: "destructive" });
    }
  });

  return (
    <Card className="hover-elevate transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="font-mono text-lg tracking-wide" data-testid={`text-order-id-${order.id}`}>
                Order #{formatOrderId(order.id)}
              </CardTitle>
              {(order.reactivationCount ?? 0) > 0 && (
                <Badge variant="outline" className="text-xs" data-testid={`badge-round-${order.id}`}>
                  Round {(order.reactivationCount ?? 0) + 1}
                </Badge>
              )}
            </div>
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
          <div className="space-y-1.5">
            {order.serviceRequests.map((req) =>
              req.acknowledgedAt === null ? (
                <div key={req.id} className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2" data-testid={`service-request-${req.id}`}>
                  <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
                  </span>
                  <Wrench className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="font-medium flex-1">Service Request</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(req.requestedAt)}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0 ml-1"
                    onClick={() => acknowledgeMutation.mutate({ orderId: order.id, requestId: req.id })}
                    disabled={acknowledgeMutation.isPending}
                    data-testid={`button-acknowledge-${req.id}`}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Acknowledge
                  </Button>
                </div>
              ) : (
                <div key={req.id} className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-md px-3 py-2" data-testid={`service-request-${req.id}`}>
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">Service Request</span>
                  <span className="text-xs text-muted-foreground">Acknowledged {timeAgo(req.acknowledgedAt)}</span>
                </div>
              )
            )}
          </div>
        )}

        {order.messages.length > 0 && (
          <div className="text-sm bg-muted/50 rounded-md px-3 py-2 space-y-2">
            <p className="font-medium text-xs text-muted-foreground">
              Messages — Showing all {order.messages.length}
              {(order as any).totalMessages && (order as any).totalMessages > order.messages.length && (
                <span className="ml-1 text-amber-600 dark:text-amber-500">({(order as any).totalMessages} total in full view)</span>
              )}
            </p>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {[...order.messages].reverse().map((msg) => (
                <div key={msg.id} className="flex items-start gap-1.5 text-xs">
                  <Badge
                    variant={msg.sender === "customer" ? "default" : "secondary"}
                    className="text-[10px] px-1.5 py-0 shrink-0 mt-0.5"
                  >
                    {msg.sender === "customer" ? "Customer" : "You"}
                  </Badge>
                  <span className="text-foreground break-words flex-1">{msg.text}</span>
                  <span className="text-muted-foreground shrink-0">{formatTime(msg.sentAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {confirmedItems.length > 0 && (
          <div className="text-sm bg-muted/50 rounded-md px-3 py-2 space-y-2" data-testid={`order-items-section-${order.id}`}>
            <p className="font-medium text-xs text-muted-foreground flex items-center gap-1">
              <ShoppingBag className="h-3 w-3" />
              Ordered Items ({confirmedItems.length})
            </p>
            <div className="space-y-1">
              {confirmedItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-xs" data-testid={`admin-order-item-${item.id}`}>
                  <span className="flex-1 truncate">
                    <span className="font-medium">{item.productName}</span>
                    {item.variantName && (
                      <span className="text-muted-foreground ml-1">({item.variantName})</span>
                    )}
                    {item.modifications && (
                      <span className="text-muted-foreground ml-1 italic">— {item.modifications}</span>
                    )}
                  </span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {item.quantity}&times; &euro;{Number(item.priceAtTime).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t pt-1.5 flex justify-end">
              <span className="text-xs font-semibold tabular-nums">
                Total: &euro;{confirmedItems.reduce((s, i) => s + i.quantity * Number(i.priceAtTime), 0).toFixed(2)}
              </span>
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

          {order.status === "notified" && (
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => onComplete(order.id)}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid={`button-complete-${order.id}`}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Mark Complete
            </Button>
          )}

          {order.status === "completed" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setResetMessages(false); setReactivateOpen(true); }}
              data-testid={`button-reactivate-${order.id}`}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reactivate
            </Button>
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

      <Dialog open={reactivateOpen} onOpenChange={setReactivateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reactivate Order #{formatOrderId(order.id)}</DialogTitle>
            <DialogDescription>
              The QR code will become active again for a new order round.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 py-2">
            <Checkbox
              id={`reset-messages-${order.id}`}
              checked={resetMessages}
              onCheckedChange={(v) => setResetMessages(!!v)}
              data-testid={`checkbox-reset-messages-${order.id}`}
            />
            <Label htmlFor={`reset-messages-${order.id}`} className="text-sm cursor-pointer">
              Clear message history for this round
            </Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setReactivateOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onReactivate(order.id, resetMessages);
                setReactivateOpen(false);
              }}
              data-testid={`button-confirm-reactivate-${order.id}`}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reactivate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
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
  onSendMessage,
  messageHistory
}: {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  onSendMessage: (orderId: string, message: string) => void;
  messageHistory?: Array<{ id: string; text: string; sender: "staff" | "customer"; sentAt: string }>;
}) {
  const [message, setMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const { toast } = useToast();

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

  const handleAiSuggest = async () => {
    if (!orderId || !messageHistory || messageHistory.length === 0) return;
    setAiLoading(true);
    try {
      const res = await apiRequest("POST", "/api/ai/suggest-reply", {
        orderId,
        messageHistory,
      });
      const data = (await res.json()) as { suggestion?: string; error?: string };
      if (data.suggestion) {
        setMessage(data.suggestion.slice(0, 200));
        toast({ title: "AI suggestion ready", description: "Review and edit before sending." });
      }
    } catch (err: any) {
      const msg = err?.message?.includes("503")
        ? "AI reply suggestions are not enabled on this server."
        : "Could not get AI suggestion. Please try again.";
      toast({ title: "AI unavailable", description: msg, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const hasHistory = messageHistory && messageHistory.length > 0;
  
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
            <div className="flex items-center justify-between">
              <Label htmlFor="custom-message">Message</Label>
              {hasHistory && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAiSuggest}
                  disabled={aiLoading}
                  data-testid="button-ai-suggest"
                  className="h-7 text-xs gap-1"
                >
                  {aiLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {aiLoading ? "Thinking…" : "AI Suggest"}
                </Button>
              )}
            </div>
            <Input
              id="custom-message"
              placeholder="e.g., Your order is almost ready..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
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
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: me, isLoading: meLoading, isError: meError } = useQuery<{ userId: number; username: string }>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 60_000,
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      navigate("/login");
    },
  });

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [notifyOrderId, setNotifyOrderId] = useState<string | null>(null);
  const [messageOrderId, setMessageOrderId] = useState<string | null>(null);
  const [scheduleOrderId, setScheduleOrderId] = useState<string | null>(null);
  const [offerOrderId, setOfferOrderId] = useState<string | null>(null);
  const [notesOrderId, setNotesOrderId] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioEnabledRef = useRef(false);
  const [isAdminMuted, setIsAdminMuted] = useState(() => localStorage.getItem("admin_muted") === "true");
  const isAdminMutedRef = useRef(isAdminMuted);
  useEffect(() => { isAdminMutedRef.current = isAdminMuted; }, [isAdminMuted]);
  const toggleAdminMute = useCallback(() => {
    setIsAdminMuted((prev) => {
      const next = !prev;
      localStorage.setItem("admin_muted", String(next));
      isAdminMutedRef.current = next;
      return next;
    });
  }, []);
  
  const playStaffSound = useCallback((type: 'service_request' | 'new_registration' | 'order_completed' | 'message') => {
    if (!audioEnabledRef.current || isAdminMutedRef.current) return;
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
      case 'message':
        audioManager.play('message');
        break;
    }
  }, []);

  // Keyboard shortcut: N for new order
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "n" || e.key === "N") {
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA" && !selectedOrder && !notifyOrderId && !messageOrderId && !scheduleOrderId && !offerOrderId && !notesOrderId) {
          e.preventDefault();
          handleCreateOrder();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedOrder, notifyOrderId, messageOrderId, scheduleOrderId, offerOrderId, notesOrderId]);
  
  const showEventToast = useCallback((eventType: string, orderId: string) => {
    if (eventType === "service_request") {
      toast({
        title: "Service Request",
        description: `Order ${orderId} needs assistance`,
        variant: "destructive",
      });
    } else if (eventType === "new_registration") {
      toast({
        title: "New Customer",
        description: `Order ${orderId} customer arrived`,
      });
    } else if (eventType === "message") {
      toast({
        title: "Customer Message",
        description: `Order ${orderId.slice(0, 8).toUpperCase()} sent a message`,
      });
    }
  }, [toast]);

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
  
  // ── AudioContext lifecycle cleanup ──
  useEffect(() => { return () => audioManager.cleanup(); }, []);

  // Admin WebSocket — real-time alerts via reusable hook
  const { connectionStatus } = useAdminWebSocket((eventType, orderId) => {
    if (eventType === "ORDER_CONFIRMED") {
      // Invalidate only the specific order's items query — no sound/vibration for order confirmations
      if (orderId) {
        queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "order-items"] });
      }
      return;
    }
    playStaffSound(eventType as "service_request" | "new_registration" | "order_completed" | "message");
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    showEventToast(eventType, orderId);
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    queryClient.refetchQueries({ queryKey: ["/api/orders"] });
  });

  // ── queries — server-side filtered + paginated; polling rate adapts to WS health ──
  const pollInterval = connectionStatus === "connected" ? 15000 : 3000;

  const activeQuery = useQuery<PaginatedOrdersResponse>({
    queryKey: ["/api/orders", "active"],
    queryFn: async () => {
      const res = await fetch(`/api/orders?status=${ACTIVE_STATUSES}&limit=50&offset=0`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    refetchInterval: pollInterval,
  });

  const completedQuery = useQuery<PaginatedOrdersResponse>({
    queryKey: ["/api/orders", "completed"],
    queryFn: async () => {
      const res = await fetch(`/api/orders?status=completed&limit=50&offset=0`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    refetchInterval: pollInterval,
  });

  const isLoading = activeQuery.isLoading;
  const refetch = () => { activeQuery.refetch(); completedQuery.refetch(); };

  useEffect(() => {
    console.log(`[Admin Poll] ${pollInterval}ms (WS: ${connectionStatus})`);
  }, [pollInterval, connectionStatus]);

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

  const completeOrderMutation = useMutation({
    mutationFn: (orderId: string) => apiRequest("POST", `/api/orders/${orderId}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order completed",
        description: "Order has been marked as complete"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to complete order",
        variant: "destructive"
      });
    }
  });

  const reactivateOrderMutation = useMutation({
    mutationFn: ({ orderId, resetMessages }: { orderId: string; resetMessages: boolean }) =>
      apiRequest("POST", `/api/orders/${orderId}/reactivate`, { resetMessages }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order reactivated",
        description: "QR code is active again for a new round"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reactivate order",
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
  
  const activeOrders = activeQuery.data?.orders ?? [];
  const completedOrders = completedQuery.data?.orders ?? [];

  if (meLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }
  if (meError || !me) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between gap-4 px-4 mx-auto max-w-6xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Bell className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold">Restaurant Buzzer</h1>
            <span
              data-testid="status-ws-connection"
              title={`WebSocket: ${connectionStatus}`}
              className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                connectionStatus === "connected"
                  ? "bg-green-500"
                  : connectionStatus === "reconnecting"
                    ? "bg-yellow-500"
                    : connectionStatus === "connecting"
                      ? "bg-yellow-400 animate-pulse"
                      : "bg-red-500"
              }`}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant={audioEnabled ? "secondary" : "outline"} className="text-xs">
              <Volume2 className="h-3 w-3 mr-1" />
              {audioEnabled ? "Sound On" : "Tap to enable sound"}
            </Badge>
            <Button
              variant={isAdminMuted ? "outline" : "ghost"}
              size="icon"
              onClick={toggleAdminMute}
              aria-label={isAdminMuted ? "Unmute alerts" : "Mute alerts"}
              title={isAdminMuted ? "Unmute alerts" : "Mute alerts"}
              data-testid="button-admin-mute"
            >
              {isAdminMuted ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4 text-green-600" />}
            </Button>
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
            {completedOrders.length > 0 && (
              <Button
                variant="outline"
                onClick={async () => {
                  if (!confirm("Remove all completed orders older than 24 hours?")) return;
                  try {
                    await apiRequest("POST", "/api/orders/cleanup", { maxAgeHours: 24 });
                    toast({ title: "Success", description: "Completed orders removed" });
                    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
                  } catch (error) {
                    toast({ title: "Error", description: "Cleanup failed", variant: "destructive" });
                  }
                }}
                data-testid="button-cleanup"
              >
                Clear Completed
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              title={`Logged in as ${me.username} — click to sign out`}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      
      <main role="main" aria-label="Order Management Dashboard" id="main-content" className="container px-4 py-8 mx-auto max-w-6xl">
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
                    onComplete={(id) => completeOrderMutation.mutate(id)}
                    onReactivate={(id, reset) => reactivateOrderMutation.mutate({ orderId: id, resetMessages: reset })}
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
                    onComplete={(id) => completeOrderMutation.mutate(id)}
                    onReactivate={(id, reset) => reactivateOrderMutation.mutate({ orderId: id, resetMessages: reset })}
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
        messageHistory={
          [...(activeQuery.data?.orders ?? []), ...(completedQuery.data?.orders ?? [])]
            .find((o) => o.id === messageOrderId)?.messages
        }
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
        initialNotes={[...activeOrders, ...completedOrders].find(o => o.id === notesOrderId)?.notes || ""}
      />
    </div>
  );
}
