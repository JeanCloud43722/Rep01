import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X } from "lucide-react";

export type Message = {
  id: string;
  sender: "customer" | "staff";
  text: string;
  sentAt?: string;
  timestamp?: string;
  read?: boolean;
};

export interface MessageModalProps {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  messages?: Message[];
  onSendMessage: (orderId: string, text: string) => Promise<void>;
}

const QUICK_REPLIES = [
  "On the way!",
  "We're checking on that for you.",
  "Please come to the counter to pick up your order.",
  "Thank you for your patience!",
];

export function MessageModal({
  orderId,
  open,
  onClose,
  messages = [],
  onSendMessage,
}: MessageModalProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 0);
    }
  }, [messages]);

  const handleSend = async () => {
    if (!draft.trim() || !orderId || sending) return;

    setSending(true);
    try {
      await onSendMessage(orderId, draft.trim());
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  const handleQuickReply = async (reply: string) => {
    if (!orderId || sending) return;

    setSending(true);
    try {
      await onSendMessage(orderId, reply);
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  if (!open || !orderId) return null;

  const msgList = messages || [];
  const displayMessages = msgList.map((msg) => ({
    id: msg.id,
    sender: msg.sender,
    text: msg.text,
    timestamp: msg.sentAt || msg.timestamp || new Date().toISOString(),
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col border">
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b">
          <h3 className="font-semibold text-base">Chat – Order {orderId.slice(-4)}</h3>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-message-modal">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Message History */}
        <ScrollArea className="flex-1 px-4 py-3 overflow-y-auto">
          <div className="space-y-3 pr-4">
            {displayMessages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No messages yet. Start a conversation.</p>
            ) : (
              displayMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === "staff" ? "justify-end" : "justify-start"}`}
                  data-testid={`message-${msg.sender}-${msg.id}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-3 py-2 ${
                      msg.sender === "staff"
                        ? "bg-primary text-primary-foreground rounded-br-none"
                        : "bg-muted text-muted-foreground rounded-bl-none"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                    <span
                      className={`text-xs mt-1 block opacity-70 ${
                        msg.sender === "staff" ? "text-primary-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Quick Replies */}
        {QUICK_REPLIES.length > 0 && (
          <div className="px-4 py-2 border-t bg-muted/30">
            <div className="flex flex-wrap gap-2">
              {QUICK_REPLIES.map((reply) => (
                <Button
                  key={reply}
                  variant="outline"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => handleQuickReply(reply)}
                  disabled={sending}
                  data-testid={`quick-reply-${reply.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {reply}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Compose Area */}
        <div className="p-4 border-t flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 resize-none min-h-[80px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={sending}
            data-testid="textarea-message-input"
          />
          <Button
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            className="self-end"
            data-testid="button-send-message"
          >
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
