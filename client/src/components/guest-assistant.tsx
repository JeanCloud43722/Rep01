import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, ChevronDown, ChevronUp, ExternalLink, ShoppingBag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { OrderConfirmation } from "./OrderConfirmation";
import { PushManager } from "@/lib/push-manager";
import type { OrderPreview } from "./OrderConfirmation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Source {
  type: "knowledge-base" | "web";
  title: string;
  excerpt: string;
  url?: string;
  category?: string;
}

interface Answer {
  question: string;
  answer: string;
  sources: Source[];
  orderPreview?: OrderPreview | null;
  isOrderingMode?: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface GuestAssistantProps {
  orderId: string;
  /** When set, auto-opens the assistant and pre-fills the question input (for cart injection). */
  pendingOrder?: string | null;
  /** Called after pendingOrder has been consumed so the parent can clear it. */
  onClearPendingOrder?: () => void;
  /** Called when order confirmation pending state changes. */
  onConfirmationPendingChange?: (isPending: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GuestAssistant({ orderId, pendingOrder, onClearPendingOrder, onConfirmationPendingChange }: GuestAssistantProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const answerEndRef = useRef<HTMLDivElement>(null);
  const pushManagerRef = useRef<PushManager | null>(null);

  // Ordering mode: activated when pendingOrder cart injection arrives
  const [orderingMode, setOrderingMode] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  // Soft-lock: disable chat input while order confirmation is pending
  const [isConfirmationPending, setIsConfirmationPending] = useState(false);

  // Initialize PushManager
  useEffect(() => {
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (vapidKey) {
      pushManagerRef.current = new PushManager(vapidKey);
    }
  }, []);

  // Request push permission on user interaction
  useEffect(() => {
    const handleUserInteraction = async () => {
      if (!pushManagerRef.current) return;

      // Only request if not already decided
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        try {
          await pushManagerRef.current.requestPermissionOnInteraction();
        } catch (err) {
          console.warn('[Push] Permission request failed:', err);
        }
      }

      // Remove listeners after first interaction
      const events = ['click', 'touchstart', 'keydown', 'scroll'];
      events.forEach((evt) => window.removeEventListener(evt, handleUserInteraction));
    };

    const events = ['click', 'touchstart', 'keydown', 'scroll'];
    events.forEach((evt) => window.addEventListener(evt, handleUserInteraction, { passive: true, once: true }));

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserInteraction));
    };
  }, []);

  useEffect(() => {
    if (answers.length > 0) {
      answerEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [answers]);

  // Cart injection: when a pending order arrives, open the assistant and pre-fill
  useEffect(() => {
    if (!pendingOrder) return;
    setOpen(true);
    setQuestion(pendingOrder);
    setOrderingMode(true);
    setChatHistory([]);
    onClearPendingOrder?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOrder]);

  async function handleAsk() {
    const trimmed = question.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    try {
      if (orderingMode) {
        // ── Ordering chat: DeepSeek tool-calling endpoint ──────────────────
        const res = await apiRequest("POST", `/api/orders/${orderId}/chat`, {
          message: trimmed,
          history: chatHistory,
        });
        const data = (await res.json()) as {
          reply: string;
          order_preview: OrderPreview | null;
          meta?: { error?: string };
        };

        const newHistory: ChatMessage[] = [
          ...chatHistory,
          { role: "user", content: trimmed },
          { role: "assistant", content: data.reply },
        ];
        setChatHistory(newHistory);

        setAnswers((prev) => [
          ...prev,
          {
            question: trimmed,
            answer: data.reply,
            sources: [],
            orderPreview: data.order_preview,
            isOrderingMode: true,
          },
        ]);
      } else {
        // ── General Q&A: existing knowledge-base endpoint ─────────────────
        const res = await apiRequest("POST", "/api/ai/guest-assistant", {
          orderId,
          question: trimmed,
        });
        const data = (await res.json()) as { answer: string; sources: Source[] };
        setAnswers((prev) => [
          ...prev,
          { question: trimmed, answer: data.answer, sources: data.sources },
        ]);
      }

      setQuestion("");
    } catch {
      toast({
        title: t("ga.error_title"),
        description: t("ga.error_desc"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  }

  function handleOrderConfirmed() {
    setIsConfirmationPending(false);
    setOrderingMode(false);
    setChatHistory([]);
  }

  function handleOrderDismissed(answerIndex: number) {
    setAnswers((prev) =>
      prev.map((a, i) =>
        i === answerIndex ? { ...a, orderPreview: null } : a
      )
    );
    setIsConfirmationPending(false);
    setOrderingMode(false);
    setChatHistory([]);
  }

  // Track when order confirmation is pending (order preview shown)
  useEffect(() => {
    const lastAnswer = answers[answers.length - 1];
    const isPending = !!(lastAnswer?.orderPreview && !lastAnswer.orderPreview.requires_clarification);
    setIsConfirmationPending(isPending);
    onConfirmationPendingChange?.(isPending);
  }, [answers, onConfirmationPendingChange]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between"
          aria-expanded={open}
          data-testid="button-guest-assistant-toggle"
        >
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            {t("ga.title")}
            {orderingMode && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                <ShoppingBag className="h-2.5 w-2.5 mr-1 inline" />
                Ordering
              </Badge>
            )}
          </CardTitle>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4 pt-0">
          <p className="text-sm text-muted-foreground">
            {orderingMode ? "Place your order using our AI assistant." : t("ga.subtitle")}
          </p>

          {/* Q&A / ordering history */}
          {answers.length > 0 && (
            <div
              className="space-y-4 max-h-80 overflow-y-auto pr-1"
              role="log"
              aria-live="polite"
              aria-label={t("ga.history_label")}
            >
              {answers.map((a, i) => (
                <div key={i} className="space-y-2">
                  {/* Question bubble */}
                  <div className="flex justify-end">
                    <div className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap">
                      {a.question}
                    </div>
                  </div>

                  {/* Answer bubble */}
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-md px-3 py-2 text-sm max-w-[90%] space-y-2 w-full">
                      {/* Strip the JSON code block from display when we have an order preview */}
                      <p className="whitespace-pre-wrap">
                        {a.orderPreview
                          ? a.answer.replace(/```(?:json)?\s*[\s\S]*?```/g, "").trim()
                          : a.answer}
                      </p>

                      {/* Sources (Q&A mode) */}
                      {!a.isOrderingMode && a.sources.length > 0 && (
                        <div className="border-t border-border pt-2 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("ga.sources")}
                          </p>
                          {a.sources.map((src, si) => (
                            <div key={si} className="flex items-start gap-1">
                              <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">
                                {src.type === "web"
                                  ? t("ga.source_web")
                                  : src.category ?? t("ga.source_kb")}
                              </Badge>
                              <div className="flex-1 min-w-0">
                                {src.url ? (
                                  <a
                                    href={src.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary flex items-center gap-0.5 hover:underline truncate"
                                    data-testid={`link-source-${si}`}
                                  >
                                    {src.title}
                                    <ExternalLink
                                      className="h-2.5 w-2.5 shrink-0"
                                      aria-hidden="true"
                                    />
                                  </a>
                                ) : (
                                  <span className="text-xs text-muted-foreground truncate block">
                                    {src.title}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Order confirmation panel (ordering mode only) */}
                      {a.orderPreview && !a.orderPreview.requires_clarification && (
                        <OrderConfirmation
                          orderId={orderId}
                          orderPreview={a.orderPreview}
                          onConfirmed={handleOrderConfirmed}
                          onDismiss={() => handleOrderDismissed(i)}
                          onResolved={(action) => {
                            if (action === "confirmed") {
                              handleOrderConfirmed();
                            } else {
                              handleOrderDismissed(i);
                            }
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={answerEndRef} />
            </div>
          )}

          {/* Input area */}
          <div className="flex gap-2 items-end">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isConfirmationPending
                  ? "Please confirm or cancel your current order above."
                  : orderingMode
                    ? "Describe your order or ask about menu items…"
                    : t("ga.placeholder")
              }
              className={`resize-none text-sm min-h-[60px] transition-all ${
                isConfirmationPending
                  ? "bg-gray-100 border-gray-300 text-gray-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400"
                  : ""
              }`}
              rows={2}
              disabled={isLoading || isConfirmationPending}
              aria-label={t("ga.input_label")}
              aria-disabled={isConfirmationPending}
              aria-describedby={isConfirmationPending ? "confirmation-hint" : undefined}
              data-testid="input-guest-question"
            />
            <Button
              onClick={handleAsk}
              disabled={!question.trim() || isLoading || isConfirmationPending}
              size="default"
              aria-label={t("ga.send_label")}
              aria-disabled={isConfirmationPending || isLoading}
              data-testid="button-guest-ask"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>

          {isConfirmationPending && (
            <p
              id="confirmation-hint"
              className="text-xs text-gray-500 dark:text-gray-400 text-center"
              role="status"
            >
              ✋ Order confirmation pending – please confirm or cancel first
            </p>
          )}

          <p className="text-xs text-muted-foreground text-center">{t("ga.disclaimer")}</p>
        </CardContent>
      )}
    </Card>
  );
}
