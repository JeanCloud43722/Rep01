import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw } from "lucide-react";
import { audioManager } from "@/lib/audio-manager";
import { CategoryTabs } from "./CategoryTabs";
import { ProductCard } from "./ProductCard";
import { ProductModal } from "./ProductModal";
import { CartSidebar } from "./CartSidebar";
import type { Product, CartItem } from "./types";
import { loadCart, saveCart, fetchProducts } from "./types";

export interface ProductCatalogProps {
  orderId: string;
  onSendToChat: (message: string) => void;
  isConfirmationPending?: boolean;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function ProductCatalog({ orderId, onSendToChat, isConfirmationPending }: ProductCatalogProps) {
  const queryClient = useQueryClient();

  // ── category + search state ─────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  // ── cart state with localStorage persistence ─────────────────────────────
  const [cart, setCart] = useState<CartItem[]>(() => loadCart(orderId));

  const updateCart = useCallback(
    (updater: (prev: CartItem[]) => CartItem[]) => {
      setCart((prev) => {
        const next = updater(prev);
        saveCart(orderId, next);
        return next;
      });
    },
    [orderId]
  );

  // ── modal state ──────────────────────────────────────────────────────────
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ── React Query data fetching ─────────────────────────────────────────────
  const { data: products = [], isLoading, isError, refetch } = useQuery<Product[]>({
    queryKey: ["/api/products", { category: activeCategory, search: debouncedSearch }],
    queryFn: () => fetchProducts({ category: activeCategory, search: debouncedSearch }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // ── Dynamic categories from API data (no hardcoding) ────────────────────
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", { category: null, search: "" }],
    queryFn: () => fetchProducts({}),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const categories = useMemo(() => {
    if (!allProducts.length) return [];
    const cats = Array.from(new Set(allProducts.map((p) => p.category).filter(Boolean) as string[]));
    return cats.sort((a, b) => a.localeCompare(b));
  }, [allProducts]);

  // ── Client-side search filter ────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    if (!debouncedSearch) return products;
    const q = debouncedSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.tags?.some((t) => t.toLowerCase().includes(q))
    );
  }, [products, debouncedSearch]);

  // ── Cart actions ─────────────────────────────────────────────────────────
  const handleAddToCart = useCallback(
    (item: CartItem) => {
      updateCart((prev) => {
        const existing = prev.find(
          (ci) =>
            ci.productId === item.productId &&
            ci.selectedVariant?.name === item.selectedVariant?.name
        );
        if (existing) {
          return prev.map((ci) =>
            ci.productId === item.productId &&
            ci.selectedVariant?.name === item.selectedVariant?.name
              ? { ...ci, quantity: ci.quantity + item.quantity }
              : ci
          );
        }
        return [...prev, item];
      });
      // Play add-to-cart sound
      audioManager.playIfUnlocked('add-to-cart');
    },
    [updateCart]
  );

  const handleUpdateQuantity = useCallback(
    (productId: number, variantName: string | undefined, delta: number) => {
      updateCart((prev) =>
        prev
          .map((ci) =>
            ci.productId === productId && ci.selectedVariant?.name === variantName
              ? { ...ci, quantity: Math.max(0, ci.quantity + delta) }
              : ci
          )
          .filter((ci) => ci.quantity > 0)
      );
    },
    [updateCart]
  );

  const handleRemoveItem = useCallback(
    (productId: number, variantName: string | undefined) => {
      updateCart((prev) =>
        prev.filter(
          (ci) =>
            !(ci.productId === productId && ci.selectedVariant?.name === variantName)
        )
      );
    },
    [updateCart]
  );

  const handleClearCart = useCallback(() => updateCart(() => []), [updateCart]);

  // ── Product count for screen reader announcements ──────────────────────
  const resultCountRef = useRef<HTMLParagraphElement>(null);

  return (
    <div role="main" aria-label="Menu catalog" className="space-y-3">
      {/* Skip to first product */}
      <a
        href="#first-product"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-1.5 focus:text-sm focus:shadow-md"
      >
        Skip to first item
      </a>

      {/* Search bar */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Search menu…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          aria-label="Search menu items"
          data-testid="input-product-search"
        />
      </div>

      {/* Category tabs */}
      {categories.length > 0 && (
        <CategoryTabs
          categories={categories}
          activeCategory={activeCategory}
          onSelect={setActiveCategory}
        />
      )}

      {/* Screen-reader live region for result count */}
      <p
        ref={resultCountRef}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {isLoading
          ? "Loading menu items…"
          : `${filteredProducts.length} item${filteredProducts.length !== 1 ? "s" : ""} found`}
      </p>

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-3" aria-busy="true" aria-label="Loading menu items">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md border border-border overflow-hidden">
              <Skeleton className="h-36 w-full" />
              <div className="p-2.5 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center space-y-2"
          role="alert"
        >
          <p className="text-sm text-destructive font-medium">Could not load menu</p>
          <p className="text-xs text-muted-foreground">Please check your connection and try again.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1"
            data-testid="button-catalog-retry"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && filteredProducts.length === 0 && (
        <div className="rounded-md border border-border p-8 text-center space-y-2">
          <p className="text-sm font-medium">No items found</p>
          {debouncedSearch ? (
            <p className="text-xs text-muted-foreground">
              Try a different search term or{" "}
              <button
                className="underline text-primary"
                onClick={() => setSearchQuery("")}
              >
                clear the search
              </button>
              .
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              No items in this category yet.
            </p>
          )}
        </div>
      )}

      {/* Product grid */}
      {!isLoading && !isError && filteredProducts.length > 0 && (
        <div
          className="grid grid-cols-2 gap-3"
          role="list"
          aria-label="Menu items"
        >
          {filteredProducts.map((product, idx) => (
            <div
              key={product.id}
              role="listitem"
              id={idx === 0 ? "first-product" : undefined}
            >
              <ProductCard
                product={product}
                onClick={() => {
                  setSelectedProduct(product);
                  setIsModalOpen(true);
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Cart */}
      <CartSidebar
        cart={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClear={handleClearCart}
        onSendToChat={onSendToChat}
        isConfirmationPending={isConfirmationPending}
      />

      {/* Product detail modal */}
      <ProductModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedProduct(null);
        }}
        onAddToCart={handleAddToCart}
      />
    </div>
  );
}
