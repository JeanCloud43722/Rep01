import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { audioManager } from "@/lib/audio-manager";
import { offlineStorage } from "@/lib/indexed-db-storage";
import { createWebSocketManager } from "@/lib/websocket-manager";
import { formatOrderId } from "@/lib/format-utils";
import { useToast } from "@/hooks/use-toast";
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
  Globe,
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return new Intl.DateTimeFormat('en-US', { 
      hour: "2-digit", 
      minute: "2-digit",
      timeZone: tz
    }).format(date);
  } catch {
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

function formatRelativeTime(isoString: string, t: any): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return t('time.just_now');
  if (diff < 3600) return t('time.min_ago', { minutes: Math.floor(diff / 60) });
  if (diff < 86400) return t('time.hour_ago', { hours: Math.floor(diff / 3600) });
  return t('time.day_ago', { days: Math.floor(diff / 86400) });
}

function formatRemainingTime(scheduledTime: string): string {
  const diff = new Date(scheduledTime).getTime() - Date.now();
  if (diff <= 0) return "Ready now!";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return h > 0 ? `${h}h ${m}m ${s}s remaining` : `${m}m ${s}s remaining`;
}

function getStatusConfig(status: Order["status"], t: any) {
  switch (status) {
    case "waiting":
    case "subscribed":
      return { icon: Clock, title: t('status.waiting.title'), description: t('status.waiting.description'), color: "text-primary" };
    case "scheduled":
      return { icon: Calendar, title: t('status.scheduled.title'), description: t('status.scheduled.description'), color: "text-primary" };
    case "notified":
    case "completed":
      return { icon: CheckCircle2, title: t('status.notified.title'), description: t('status.notified.description'), color: "text-green-600 dark:text-green-500" };
    default:
      return { icon: AlertCircle, title: t('status.unknown.title'), description: t('status.unknown.description'), color: "text-muted-foreground" };
  }
}

// ─── sub-components ─────────────────────────────────────────────────────────

function StatusCard({ order, onRequestService, isRequestingService }: {
  order: Order;
  onRequestService: () => void;
  isRequestingService: boolean;
}) {
  const { t } = useTranslation();
  const config = getStatusConfig(order.status, t);
  const StatusIcon = config.icon;
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    if (!order.scheduledTime || order.status !== "scheduled") return;
    setRemaining(formatRemainingTime(order.scheduledTime));
    const id = setInterval(() => setRemaining(formatRemainingTime(order.scheduledTime!)), 1000);
    return () => clearInterval(id);
  }, [order.scheduledTime, order.status]);

  const isReady = order.status === "notified" || order.status === "completed";

  return (
    <Card aria-live="polite" aria-atomic="true">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center text-center space-y-5">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center ${isReady ? "bg-green-100 dark:bg-green-900/30" : "bg-primary/10"}`}>
            <StatusIcon className={`h-10 w-10 ${config.color}`} />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-semibold">{config.title}</h3>
            <p className="text-muted-foreground text-sm">{config.description}</p>
          </div>
          {order.scheduledTime && order.status === "scheduled" && (
            <div className="flex flex-col items-center gap-1 w-full">
              <div className="flex items-center gap-2 text-base font-semibold text-primary bg-primary/10 rounded-lg px-4 py-2 w-full justify-center">
                <Clock className="h-4 w-4" />
                <span>{remaining}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t('card.ready_at')} {formatTime(order.scheduledTime)}</p>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
            <Check className="h-4 w-4" />
            <span>{t('card.auto_update')}</span>
          </div>
          {(() => {
            const latestRequest = order.serviceRequests.length > 0
              ? [...order.serviceRequests].sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())[0]
              : null;
            if (latestRequest && latestRequest.acknowledgedAt === null) {
              return (
                <div className="flex flex-col items-center gap-2 w-full max-w-xs" data-testid="service-request-status">
                  <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-4 py-2.5 w-full justify-center">
                    <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                    </span>
                    <span className="font-medium">{t('card.service_waiting')}</span>
                  </div>
                </div>
              );
            }
            if (latestRequest && latestRequest.acknowledgedAt !== null) {
              return (
                <div className="flex flex-col items-center gap-2 w-full max-w-xs" data-testid="service-request-status">
                  <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-md px-4 py-2.5 w-full justify-center">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    <span className="font-medium">{t('card.service_acknowledged')}</span>
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(latestRequest.acknowledgedAt, t)}</span>
                  </div>
                </div>
              );
            }
            return (
              <>
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={onRequestService}
                  disabled={isRequestingService}
                  className="w-full max-w-xs"
                  aria-describedby="waiter-help"
                  data-testid="button-call-waiter"
                >
                  {isRequestingService ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <AlertCircle className="h-5 w-5 mr-2" />}
                  {isRequestingService ? t('card.calling') : t('card.call_waiter')}
                </Button>
                <p id="waiter-help" className="text-xs text-muted-foreground">{t('card.waiter_help')}</p>
              </>
            );
          })()}
        </div>
      </CardContent>
    </Card>
  );
}

function MessageThread({ order, onSend, isSending }: {
  order: Order;
  onSend: (text: string) => void;
  isSending: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [order.messages.length]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          {t('chat.title')}
          {order.messages.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {order.messages.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3" aria-live="polite" aria-label="Message thread">
        {order.messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {t('chat.no_messages')}
          </p>
        ) : (
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {order.messages.map((msg) => {
              const isCustomer = msg.sender === "customer";
              return (
                <div key={msg.id} className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    isCustomer
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}>
                    <p className="break-words">{msg.text}</p>
                    <p className={`text-xs mt-1 ${isCustomer ? "text-primary-foreground/70 text-right" : "text-muted-foreground"}`}>
                      {isCustomer ? t('chat.you') : t('chat.staff')} · {formatRelativeTime(msg.sentAt, t)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Input
            type="text"
            placeholder={t('chat.placeholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            disabled={isSending}
            maxLength={200}
            className="flex-1"
            aria-label={t('chat.send_btn')}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!text.trim() || isSending}
            aria-label="Send message"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderNotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">{t('order.notFound')}</h3>
              <p className="text-sm text-muted-foreground">{t('order.notFound_desc')}</p>
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
        <CardContent className="pt-10 flex flex-col items-center space-y-6">
          <Skeleton className="w-20 h-20 rounded-full" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-12 w-full max-w-xs" />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function CustomerPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  // ── audio / push state ──
  const [audioUnlocked, setAudioUnlocked] = useState(() => audioManager.isUnlocked);
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("customer_muted") === "true");
  const isMutedRef = useRef(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  const [pushEnabled, setPushEnabled] = useState(() => typeof window !== "undefined" && Notification.permission === "granted");

  // ── connection state ──
  const [wsConnected, setWsConnected] = useState(false);

  // ── order data ──
  const [hasRegistered, setHasRegistered] = useState(false);
  const [cachedOrder, setCachedOrder] = useState<Order | null>(null);

  // ── mute toggle (T006) ──
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      localStorage.setItem("customer_muted", String(next));
      return next;
    });
  }, []);

  // ── order-ready sound (double sine chime via AudioManager) ──
  const playBuzzer = useCallback(() => {
    if (isMutedRef.current) return;
    audioManager.play("order-ready");
  }, []);

  // ── message chime (staff message) ──
  const playMessageChime = useCallback(() => {
    if (isMutedRef.current) return;
    audioManager.playIfUnlocked("message");
  }, []);

  // ── push subscription ──
  const subscribeToPushSilent = useCallback(async () => {
    if (!orderId) return;
    try {
      const { publicKey } = await fetch("/api/vapid-public-key").then((r) => r.json());
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      // Android debug: log the push service host (should be fcm.googleapis.com on Android)
      const subJson = sub.toJSON() as { endpoint?: string };
      if (subJson.endpoint) {
        const pushHost = subJson.endpoint.split("/")[2];
        console.log("[Push] Subscribed via:", pushHost);
        console.log("[Push] Endpoint origin:", pushHost?.includes("fcm.googleapis") ? "Android FCM" : pushHost?.includes("push.apple") ? "Apple APNs" : "Other/Desktop");
      }
      await apiRequest("POST", `/api/orders/${orderId}/subscribe`, { subscription: sub.toJSON() });
      setPushEnabled(true);
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    } catch (e) {
      console.error("[Push] Subscription failed:", e);
    }
  }, [orderId]);

  // ── auto-enable on first interaction ──
  const autoEnable = useCallback(async () => {
    try {
      const ok = await audioManager.unlock();
      if (ok) {
        setAudioUnlocked(true);
        if (!isMutedRef.current) playBuzzer();
      }
    } catch (e) {
      console.warn("[AutoEnable] Audio:", e);
    }
    if ("Notification" in window && "serviceWorker" in navigator && orderId) {
      try {
        let perm = Notification.permission;
        if (perm !== "granted") perm = await Notification.requestPermission();
        if (perm === "granted") subscribeToPushSilent();
      } catch (e) {
        console.warn("[AutoEnable] Push:", e);
      }
    }
  }, [orderId, playBuzzer, subscribeToPushSilent]);

  useEffect(() => {
    const handle = () => {
      autoEnable();
      events.forEach((e) => document.removeEventListener(e, handle));
    };
    const events = ["touchstart", "click", "pointerdown", "mousedown", "keydown"];
    events.forEach((e) => document.addEventListener(e, handle, { once: true, passive: true }));
    return () => events.forEach((e) => document.removeEventListener(e, handle));
  }, [autoEnable]);

  useEffect(() => {
    const resumeOnInteraction = async () => {
      const ctx = audioManager.getContext();
      if (ctx && ctx.state === "suspended") {
        try {
          await ctx.resume();
          console.log("[ResumeAudio] AudioContext resumed on interaction");
        } catch (e) {
          console.warn("[ResumeAudio] resume failed:", e);
        }
      }
      if (!audioManager.isUnlocked) {
        try {
          const ok = await audioManager.unlock();
          if (ok) setAudioUnlocked(true);
        } catch {}
      }
      if ("Notification" in window && "serviceWorker" in navigator && orderId && !pushEnabled) {
        try {
          if (Notification.permission === "default") {
            const perm = await Notification.requestPermission();
            if (perm === "granted") subscribeToPushSilent();
          } else if (Notification.permission === "granted") {
            subscribeToPushSilent();
          }
        } catch {}
      }
    };
    const interactionEvents = ["touchstart", "click", "pointerdown", "mousedown", "keydown"];
    interactionEvents.forEach((e) =>
      document.addEventListener(e, resumeOnInteraction, { passive: true })
    );
    return () =>
      interactionEvents.forEach((e) =>
        document.removeEventListener(e, resumeOnInteraction)
      );
  }, [orderId, pushEnabled, subscribeToPushSilent]);

  useEffect(() => audioManager.onUnlockChange(setAudioUnlocked), []);

  // ── AudioContext lifecycle cleanup ──
  useEffect(() => { return () => audioManager.cleanup(); }, []);

  // ── offline indicator + outbox sync ──
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      await offlineStorage.syncOutbox();
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    };
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [orderId]);

  useEffect(() => {
    const handleVisible = async () => {
      if (document.visibilityState !== "visible") return;
      const ctx = audioManager.getContext();
      if (ctx && ctx.state === "suspended") {
        try {
          await ctx.resume();
          console.log("[Visibility] AudioContext resumed on page visible");
        } catch {}
      }
    };
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, []);

  // ── offline cache ──
  useEffect(() => {
    if (!orderId) return;
    offlineStorage.getOrder(orderId).then((c) => { if (c) setCachedOrder(c); });
  }, [orderId]);

  // ── query — polling slows down when WebSocket is healthy ──
  const pollInterval = wsConnected ? 15000 : 3000;
  const { data: order, isLoading } = useQuery<Order | null>({
    queryKey: ["/api/orders", orderId],
    enabled: !!orderId,
    refetchInterval: pollInterval,
    initialData: cachedOrder || undefined,
    queryFn: async () => offlineStorage.syncOrderFromServer(orderId),
  });

  useEffect(() => {
    console.log(`[Customer Poll] ${pollInterval}ms (WS: ${wsConnected})`);
  }, [pollInterval, wsConnected]);

  // Screen reader announcements
  useEffect(() => {
    if (order?.status === "notified" && typeof window !== "undefined" && (window as any).announceToScreenReader) {
      (window as any).announceToScreenReader("Your order is ready for pickup");
    }
  }, [order?.status]);

  useEffect(() => {
    if (order && order.messages.length > 0 && typeof window !== "undefined" && (window as any).announceToScreenReader) {
      const lastMsg = order.messages[order.messages.length - 1];
      if (lastMsg.sender === "staff") {
        (window as any).announceToScreenReader("New message from staff");
      }
    }
  }, [order?.messages.length]);

  useEffect(() => {
    if (order && orderId) offlineStorage.saveOrder(order).catch(console.warn);
  }, [order, orderId]);

  // ── WebSocket via WebSocketManager ──
  useEffect(() => {
    if (!orderId) return;
    const wsManager = createWebSocketManager({
      url: `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/orders?id=${orderId}`,
      orderId,
      onMessage: (msg) => {
        if (msg.type === "order_updated") {
          if (msg.eventType === "order_ready") playBuzzer();
          else if (msg.eventType === "message") playMessageChime();
          queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
          queryClient.refetchQueries({ queryKey: ["/api/orders", orderId] });
        } else if (msg.type === "sync_response" && msg.order) {
          queryClient.setQueryData(["/api/orders", orderId], msg.order);
        }
      },
      onConnect: () => setWsConnected(true),
      onDisconnect: () => setWsConnected(false),
      onReconnecting: (attempt) => console.log(`[Customer WS] Reconnecting attempt ${attempt}`),
    });
    return () => wsManager.close();
  }, [orderId, playBuzzer, playMessageChime]);

  // ── Service Worker messages ──
  useEffect(() => {
    if (!navigator.serviceWorker) return;
    const handle = (event: MessageEvent) => {
      if (event.data?.type === "ORDER_READY") {
        playBuzzer();
        queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
        queryClient.refetchQueries({ queryKey: ["/api/orders", orderId] });
      }
    };
    navigator.serviceWorker.addEventListener("message", handle);
    return () => navigator.serviceWorker.removeEventListener("message", handle);
  }, [orderId, playBuzzer]);

  // ── Service Worker registration ──
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(console.error);
  }, []);

  // ── mutations ──
  const registerMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/orders/${orderId}/register`),
    onSuccess: () => {
      setHasRegistered(true);
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    },
  });

  const serviceRequestMutation = useMutation({
    mutationFn: async () => {
      try {
        return await apiRequest("POST", `/api/orders/${orderId}/service`);
      } catch (error) {
        if (!navigator.onLine) {
          await offlineStorage.addToOutbox(`/api/orders/${orderId}/service`, "POST");
          throw new Error("offline");
        }
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] }),
    onError: (error: any) => {
      if (error.message === "offline") {
        toast({ title: t('toast.offline_title'), description: t('toast.offline_service') });
      }
    }
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      try {
        return await apiRequest("POST", `/api/orders/${orderId}/customer-message`, { message: text });
      } catch (error) {
        if (!navigator.onLine) {
          await offlineStorage.addToOutbox(`/api/orders/${orderId}/customer-message`, "POST", { message: text });
          throw new Error("offline");
        }
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] }),
    onError: (error: any) => {
      if (error.message === "offline") {
        toast({ title: t('toast.offline_title'), description: t('toast.offline_message') });
      }
    }
  });

  useEffect(() => {
    if (order && order.status === "waiting" && !hasRegistered && !registerMutation.isPending) {
      registerMutation.mutate();
    }
  }, [order, hasRegistered, registerMutation]);

  if (isLoading && !order) return <LoadingState />;
  if (!order) return <OrderNotFound />;

  const isSetupComplete = pushEnabled && audioUnlocked;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {!isOnline && (
        <div className="bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-900 px-4 py-2 text-center text-sm text-amber-900 dark:text-amber-100">
          {t('offline.banner')}
        </div>
      )}
      <main role="main" aria-label="Order Status" id="main-content" className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-4">

        {/* Header */}
        <div className="text-center space-y-1">
          <Badge variant="outline" className="font-mono text-sm px-3 py-1">
            Order #{formatOrderId(order.id)}
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight">{t('order.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('order.subtitle')}</p>
        </div>

        {/* Language toggle button */}
        <div className="flex justify-center gap-1">
          <Button
            variant={i18n.language === 'en' ? 'default' : 'outline'}
            size="sm"
            onClick={() => i18n.changeLanguage('en')}
            className="gap-1"
          >
            <Globe className="h-3 w-3" />
            EN
          </Button>
          <Button
            variant={i18n.language === 'de' ? 'default' : 'outline'}
            size="sm"
            onClick={() => i18n.changeLanguage('de')}
            className="gap-1"
          >
            <Globe className="h-3 w-3" />
            DE
          </Button>
        </div>

        {/* Notification setup prompt */}
        {!isSetupComplete && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="pt-5 text-center space-y-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-sm">{t('order.header')}</p>
                <p className="text-xs text-muted-foreground">{t('order.header_subtitle')}</p>
              </div>
              <Button onClick={autoEnable} className="w-full" size="lg">
                {t('order.enable_btn')}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Order status */}
        <StatusCard
          order={order}
          onRequestService={() => serviceRequestMutation.mutate()}
          isRequestingService={serviceRequestMutation.isPending}
        />

        {/* Message thread (T003) */}
        <MessageThread
          order={order}
          onSend={(text) => sendMessageMutation.mutate(text)}
          isSending={sendMessageMutation.isPending}
        />

        {/* Status bar with mute toggle (T006) */}
        <div className="flex items-center justify-between px-1 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Bell className={`h-3 w-3 ${pushEnabled ? "text-green-600" : "text-muted-foreground"}`} />
              <span className={pushEnabled ? "text-green-600" : "text-muted-foreground"}>
                {pushEnabled ? t('status.push_on') : t('status.push_off')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {audioUnlocked
                ? <Volume2 className="h-3 w-3 text-green-600" />
                : <VolumeX className="h-3 w-3 text-amber-600" />}
              <span className={audioUnlocked ? "text-green-600" : "text-amber-600"}>
                {audioUnlocked ? t('status.audio_ready') : t('status.tap_enable')}
              </span>
            </div>
          </div>
          <button
            onClick={toggleMute}
            className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors hover-elevate ${
              isMuted
                ? "bg-muted text-muted-foreground"
                : "bg-primary/10 text-primary"
            }`}
            aria-label={isMuted ? t('status.unmute') : t('status.mute')}
            aria-pressed={isMuted}
          >
            {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            <span>{isMuted ? t('status.muted') : t('status.sound_on')}</span>
          </button>
        </div>
        </div>
      </main>
    </div>
  );
}
