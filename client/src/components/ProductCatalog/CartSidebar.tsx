import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShoppingCart, Trash2, Send, Plus, Minus, ChevronUp, ChevronDown } from "lucide-react";
import type { CartItem } from "./types";
import { buildOrderMessage } from "./types";

interface CartSidebarProps {
  cart: CartItem[];
  onUpdateQuantity: (productId: number, variantName: string | undefined, delta: number) => void;
  onRemoveItem: (productId: number, variantName: string | undefined) => void;
  onClear: () => void;
  onSendToChat: (message: string) => void;
}

export function CartSidebar({
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onClear,
  onSendToChat,
}: CartSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  if (cart.length === 0) return null;

  const handleSendToChat = () => {
    const message = buildOrderMessage(cart);
    onSendToChat(message);
    onClear();
  };

  return (
    <div
      className="sticky bottom-4 z-10 mt-4"
      role="complementary"
      aria-label="Shopping cart"
    >
      <Card className="border-primary/30 shadow-md">
        <CardHeader className="py-3 px-4">
          <button
            className="flex w-full items-center justify-between"
            onClick={() => setIsExpanded((v) => !v)}
            aria-expanded={isExpanded}
            aria-controls="cart-items"
            data-testid="button-cart-toggle"
          >
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              Your Order
              <Badge
                variant="secondary"
                className="no-default-active-elevate"
                aria-label={`${totalItems} items`}
              >
                {totalItems}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" aria-label={`Total €${totalPrice.toFixed(2)}`}>
                €{totalPrice.toFixed(2)}
              </span>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              ) : (
                <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              )}
            </div>
          </button>
        </CardHeader>

        {isExpanded && (
          <CardContent className="pt-0 px-4 pb-4 space-y-3" id="cart-items">
            <Separator />
            <ul className="space-y-2 max-h-48 overflow-y-auto" aria-label="Cart items">
              {cart.map((item) => {
                const key = `${item.productId}-${item.selectedVariant?.name ?? ""}`;
                return (
                  <li key={key} className="flex items-start gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.productName}</p>
                      {item.selectedVariant && (
                        <p className="text-xs text-muted-foreground">{item.selectedVariant.name}</p>
                      )}
                      {item.modifications && (
                        <p className="text-xs text-muted-foreground italic truncate">
                          {item.modifications}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => onUpdateQuantity(item.productId, item.selectedVariant?.name, -1)}
                        aria-label={`Decrease quantity of ${item.productName}`}
                        data-testid={`button-cart-decrease-${item.productId}`}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span
                        className="w-5 text-center text-xs font-medium"
                        aria-label={`Quantity: ${item.quantity}`}
                      >
                        {item.quantity}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => onUpdateQuantity(item.productId, item.selectedVariant?.name, 1)}
                        aria-label={`Increase quantity of ${item.productName}`}
                        data-testid={`button-cart-increase-${item.productId}`}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <span className="text-xs text-muted-foreground w-12 text-right">
                        €{(item.unitPrice * item.quantity).toFixed(2)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive"
                        onClick={() => onRemoveItem(item.productId, item.selectedVariant?.name)}
                        aria-label={`Remove ${item.productName}`}
                        data-testid={`button-cart-remove-${item.productId}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <Separator />

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onClear}
                data-testid="button-cart-clear"
                aria-label="Clear all items from cart"
              >
                Clear
              </Button>
              <Button
                size="sm"
                className="flex-1 gap-1"
                onClick={handleSendToChat}
                data-testid="button-cart-send"
                aria-label="Send order to AI assistant for confirmation"
              >
                <Send className="h-3.5 w-3.5" />
                Send to Assistant
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
