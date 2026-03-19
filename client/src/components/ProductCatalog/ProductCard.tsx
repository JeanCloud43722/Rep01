import React from "react";
import { Badge } from "@/components/ui/badge";
import { ImageIcon } from "lucide-react";
import type { Product } from "./types";
import { getNumericPrice } from "./types";

interface ProductCardProps {
  product: Product;
  onClick: () => void;
}

export const ProductCard = React.memo(
  function ProductCard({ product, onClick }: ProductCardProps) {
    const lowestPrice = getNumericPrice(product);
    const hasVariants = (product.variants?.length ?? 0) > 0;

    return (
      <article
        className="rounded-md border border-border bg-card overflow-hidden cursor-pointer hover-elevate active-elevate-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={onClick}
        onKeyDown={(e) => e.key === "Enter" && onClick()}
        tabIndex={0}
        role="button"
        aria-label={`${product.name}${hasVariants ? `, ${product.variants!.length} sizes available` : ""}`}
        data-testid={`card-product-${product.id}`}
      >
        {/* Image */}
        <div className="relative w-full h-36 bg-muted flex items-center justify-center overflow-hidden">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover motion-safe:transition-transform motion-safe:duration-300"
              onError={(e) => {
                const img = e.currentTarget;
                img.style.display = "none";
                img.nextElementSibling?.removeAttribute("hidden");
              }}
            />
          ) : null}
          {!product.imageUrl && (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <ImageIcon className="h-8 w-8 opacity-30" />
            </div>
          )}
          {/* Variant badge */}
          {hasVariants && (product.variants?.length ?? 0) > 1 && (
            <Badge
              variant="secondary"
              className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5"
              aria-hidden="true"
            >
              {product.variants!.length} sizes
            </Badge>
          )}
        </div>

        {/* Content */}
        <div className="p-2.5 space-y-1">
          <p className="text-sm font-medium leading-snug line-clamp-2">{product.name}</p>
          {product.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">{product.description}</p>
          )}
          <div className="flex items-center justify-between gap-1 pt-0.5">
            {lowestPrice !== null ? (
              <span className="text-sm font-semibold text-foreground">
                {hasVariants ? "from " : ""}€{lowestPrice.toFixed(2)}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">On request</span>
            )}
            {product.tags?.includes("vegetarian") && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">veg</Badge>
            )}
            {product.tags?.includes("vegan") && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">vegan</Badge>
            )}
          </div>
        </div>
      </article>
    );
  },
  (prev, next) =>
    prev.product.id === next.product.id && prev.product.updatedAt === next.product.updatedAt
);
