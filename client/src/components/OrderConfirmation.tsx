import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, ShoppingBag, X, AlertCircle } from "lucide-react";

// ─── Shared types (exported so guest-assistant can import them) ────────────────

export interface OrderPreviewItem {
  product_id: number;
  product_name: string;
  variant_name?: string | null;
  quantity: number;
  modifications?: string | null;
  unit_price: number;
}

export interface OrderPreview {
  intent: "order";
  items: OrderPreviewItem[];
  requires_clarification: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  orderId: string;
  orderPreview: OrderPreview;
  onConfirmed: () => void;
  onDismiss: () => void;
}

interface ConfirmResponse {
  success?: boolean;
  duplicate?: boolean;
  order_items?: unknown[];
  error?: unknown;
}

function formatPrice(price: number): string {
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function estimatedTotal(items: OrderPreviewItem[]): number {
  return items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
}

export function OrderConfirmation({ orderId, orderPreview, onConfirmed, onDismiss }: Props) {
  const { toast } = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryAction, setRecoveryAction] = useState<{ label: string; onClick: () => void } | null>(null);

  const mutation = useMutation<ConfirmResponse, Error>({
    mutationFn: async () => {
      const idempotencyKey = crypto.randomUUID();
      const items = orderPreview.items.map((i) => ({
        product_id: i.product_id,
        variant_name: i.variant_name ?? undefined,
        quantity: i.quantity,
        modifications: i.modifications ?? undefined,
      }));

      const res = await apiRequest("POST", `/api/orders/${orderId}/confirm-order`, {
        idempotencyKey,
        items,
      });
      return res.json() as Promise<ConfirmResponse>;
    },
    onSuccess: (data) => {
      if (data.duplicate) {
        toast({ title: "Order already placed", description: "This order was already confirmed." });
        setConfirmed(true);
        onConfirmed();
        return;
      }
      if (data.success) {
        setConfirmed(true);
        onConfirmed();
      }
    },
    onError: (err: any) => {
      setError(null);
      setRecoveryAction(null);

      let userMessage = "Could not place order. Please try again or ask a staff member.";
      let errorCode: string | null = null;

      // Try to parse structured error from server response
      try {
        if (err?.message) {
          // Attempt to parse as JSON
          const errData = JSON.parse(err.message);
          errorCode = errData.code;

          if (errorCode === "ITEM_UNAVAILABLE") {
            userMessage = `Sorry, "${errData.itemName}" is no longer available. Please update your order.`;
          } else if (errorCode === "PRODUCT_NOT_FOUND") {
            userMessage = "An item in your order could not be found. Please review your selection.";
          }
        }
      } catch {
        // Fallback to generic message
      }

      setError(userMessage);

      // For unavailable items, offer to refresh the product list
      if (errorCode === "ITEM_UNAVAILABLE") {
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        setRecoveryAction({
          label: "Refresh menu",
          onClick: () => {
            setError(null);
            setRecoveryAction(null);
            onDismiss();
          },
        });
      } else {
        toast({
          title: "Order failed",
          description: userMessage,
          variant: "destructive",
        });
      }
    },
  });

  if (confirmed) {
    return (
      <div
        className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-900/20 px-3 py-2 text-sm text-green-700 dark:text-green-400"
        data-testid="order-confirmation-success"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="font-medium">Order placed! Our team will prepare it shortly.</span>
      </div>
    );
  }

  const total = estimatedTotal(orderPreview.items);

  return (
    <div
      className="rounded-md border bg-card text-card-foreground shadow-sm mt-2 overflow-hidden"
      data-testid="order-confirmation-panel"
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
        <div className="flex items-center gap-1.5">
          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Order Summary</span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onDismiss}
          data-testid="button-dismiss-order-confirmation"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="px-3 pb-2 space-y-1.5">
        {orderPreview.items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-start justify-between gap-2 text-sm"
            data-testid={`order-item-row-${idx}`}
          >
            <div className="flex-1 min-w-0">
              <span className="font-medium">{item.product_name}</span>
              {item.variant_name && (
                <Badge
                  variant="outline"
                  className="ml-1.5 text-[10px] px-1.5 py-0 align-middle"
                >
                  {item.variant_name}
                </Badge>
              )}
              {item.modifications && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {item.modifications}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right text-muted-foreground tabular-nums">
              <span>{item.quantity}&times;</span>{" "}
              <span className="text-foreground font-medium">
                &euro;{formatPrice(item.unit_price)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div
          className="flex items-start gap-2 px-3 py-2 bg-destructive/10 text-destructive text-sm"
          role="alert"
          data-testid="order-confirmation-error"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p>{error}</p>
            {recoveryAction && (
              <button
                onClick={recoveryAction.onClick}
                className="mt-1 text-sm font-semibold underline hover:no-underline"
                data-testid="button-recovery-action"
              >
                {recoveryAction.label}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t bg-muted/40">
        <span className="text-xs text-muted-foreground">
          Est. total &mdash; final price validated by server
        </span>
        <span className="text-sm font-semibold tabular-nums">
          &euro;{formatPrice(total)}
        </span>
      </div>

      <div className="px-3 pb-3 pt-2 flex gap-2 justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={onDismiss}
          disabled={mutation.isPending}
          data-testid="button-cancel-order"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          data-testid="button-confirm-order"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Placing…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Confirm Order
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
