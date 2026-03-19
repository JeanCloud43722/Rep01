import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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
}

interface GuestAssistantProps {
  orderId: string;
  /** When set, auto-opens the assistant and pre-fills the question input (for cart injection). */
  pendingOrder?: string | null;
  /** Called after pendingOrder has been consumed so the parent can clear it. */
  onClearPendingOrder?: () => void;
}

export function GuestAssistant({ orderId, pendingOrder, onClearPendingOrder }: GuestAssistantProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const answerEndRef = useRef<HTMLDivElement>(null);

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
    onClearPendingOrder?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOrder]);

  async function handleAsk() {
    const trimmed = question.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/ai/guest-assistant", {
        orderId,
        question: trimmed,
      });
      const data = (await res.json()) as { answer: string; sources: Source[] };
      setAnswers((prev) => [...prev, { question: trimmed, answer: data.answer, sources: data.sources }]);
      setQuestion("");
    } catch {
      toast({ title: t("ga.error_title"), description: t("ga.error_desc"), variant: "destructive" });
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
          <p className="text-sm text-muted-foreground">{t("ga.subtitle")}</p>

          {/* Q&A history */}
          {answers.length > 0 && (
            <div className="space-y-4 max-h-80 overflow-y-auto pr-1" role="log" aria-live="polite" aria-label={t("ga.history_label")}>
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
                    <div className="bg-muted rounded-md px-3 py-2 text-sm max-w-[90%] space-y-2">
                      <p>{a.answer}</p>

                      {/* Sources */}
                      {a.sources.length > 0 && (
                        <div className="border-t border-border pt-2 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">{t("ga.sources")}</p>
                          {a.sources.map((src, si) => (
                            <div key={si} className="flex items-start gap-1">
                              <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">
                                {src.type === "web" ? t("ga.source_web") : src.category ?? t("ga.source_kb")}
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
                                    <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                                  </a>
                                ) : (
                                  <span className="text-xs text-muted-foreground truncate block">{src.title}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
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
              placeholder={t("ga.placeholder")}
              className="resize-none text-sm min-h-[60px]"
              rows={2}
              disabled={isLoading}
              aria-label={t("ga.input_label")}
              data-testid="input-guest-question"
            />
            <Button
              onClick={handleAsk}
              disabled={!question.trim() || isLoading}
              size="default"
              aria-label={t("ga.send_label")}
              data-testid="button-guest-ask"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">{t("ga.disclaimer")}</p>
        </CardContent>
      )}
    </Card>
  );
}
