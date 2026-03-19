import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Minus, Plus } from "lucide-react";
import type { Product, CartItem } from "./types";
import { sanitizeInput } from "./types";

interface ProductModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
}

export function ProductModal({ product, isOpen, onClose, onAddToCart }: ProductModalProps) {
  const [selectedVariantName, setSelectedVariantName] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [modifications, setModifications] = useState("");

  // Reset state whenever a new product is shown
  useEffect(() => {
    if (product) {
      const defaultV = product.defaultVariant ?? product.variants?.[0]?.name ?? "";
      setSelectedVariantName(defaultV);
      setQuantity(1);
      setModifications("");
    }
  }, [product?.id]);

  if (!product) return null;

  const hasVariants = (product.variants?.length ?? 0) > 0;
  const selectedVariant = hasVariants
    ? product.variants!.find((v) => v.name === selectedVariantName) ?? product.variants![0]
    : null;
  const basePrice = product.price ? parseFloat(product.price) : null;
  const unitPrice = selectedVariant?.price ?? basePrice ?? 0;
  const totalPrice = unitPrice * quantity;

  const canAdd = hasVariants ? selectedVariantName !== "" : unitPrice > 0;

  const handleAdd = () => {
    if (!canAdd) return;
    const item: CartItem = {
      productId: product.id,
      productName: product.name,
      quantity,
      selectedVariant: selectedVariant
        ? { name: selectedVariant.name, price: selectedVariant.price }
        : undefined,
      basePrice: basePrice ?? undefined,
      modifications: sanitizeInput(modifications),
      unitPrice,
    };
    onAddToCart(item);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-sm w-full max-h-[90vh] overflow-y-auto overscroll-contain"
        aria-describedby="modal-description"
      >
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">{product.name}</DialogTitle>
          {product.description && (
            <DialogDescription id="modal-description" className="text-sm text-muted-foreground">
              {product.description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* Allergens */}
          {product.allergens.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label="Allergens">
              {product.allergens.slice(0, 5).map((a) => (
                <Badge key={a} variant="outline" className="text-[10px] px-1.5 py-0">
                  {a}
                </Badge>
              ))}
              {product.allergens.length > 5 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                  +{product.allergens.length - 5} more
                </Badge>
              )}
            </div>
          )}

          {/* Variant selection */}
          {hasVariants && (
            <fieldset>
              <legend className="text-sm font-medium mb-2">Choose size</legend>
              <RadioGroup
                value={selectedVariantName}
                onValueChange={setSelectedVariantName}
                className="space-y-2"
                aria-required="true"
              >
                {product.variants!.map((v) => (
                  <div
                    key={v.name}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem
                        value={v.name}
                        id={`variant-${product.id}-${v.name}`}
                        data-testid={`radio-variant-${v.name}`}
                      />
                      <Label
                        htmlFor={`variant-${product.id}-${v.name}`}
                        className="cursor-pointer text-sm font-normal"
                      >
                        {v.name}
                        {v.description && (
                          <span className="text-xs text-muted-foreground ml-1">
                            — {v.description}
                          </span>
                        )}
                      </Label>
                    </div>
                    <span className="text-sm font-semibold">€{v.price.toFixed(2)}</span>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>
          )}

          {/* Modifications */}
          <div className="space-y-1.5">
            <Label htmlFor="modifications" className="text-sm font-medium">
              Special requests{" "}
              <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="modifications"
              placeholder="e.g. no onions, sauce on the side…"
              value={modifications}
              onChange={(e) => setModifications(e.target.value)}
              maxLength={200}
              rows={2}
              className="resize-none text-sm"
              aria-label="Special requests or modifications"
              data-testid="input-modifications"
            />
            <p className="text-xs text-muted-foreground text-right">
              {modifications.length}/200
            </p>
          </div>

          <Separator />

          {/* Quantity + Add */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2" role="group" aria-label="Quantity selector">
              <Button
                size="icon"
                variant="outline"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
                data-testid="button-modal-decrease"
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span
                className="w-8 text-center font-semibold tabular-nums"
                aria-live="polite"
                aria-label={`Quantity: ${quantity}`}
              >
                {quantity}
              </span>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                disabled={quantity >= 20}
                aria-label="Increase quantity"
                data-testid="button-modal-increase"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            <Button
              className="flex-1"
              onClick={handleAdd}
              disabled={!canAdd}
              data-testid="button-modal-add"
              aria-label={`Add ${quantity} ${product.name} to order, total €${totalPrice.toFixed(2)}`}
            >
              Add to Order — €{totalPrice.toFixed(2)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
