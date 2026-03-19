export interface ProductVariant {
  name: string;
  price: number;
  description?: string;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: string | null;
  category: string;
  categoryGroup: string | null;
  variants: ProductVariant[] | null;
  defaultVariant: string | null;
  allergens: string[];
  tags: string[];
  imageUrl: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  productId: number;
  productName: string;
  quantity: number;
  selectedVariant?: { name: string; price: number };
  basePrice?: number;
  modifications: string;
  unitPrice: number;
}

export interface StoredCart {
  items: CartItem[];
  expiresAt: number;
}

const CART_TTL_MS = 24 * 60 * 60 * 1000;

export function loadCart(orderId: string): CartItem[] {
  try {
    const raw = localStorage.getItem(`bistro_cart_${orderId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredCart;
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(`bistro_cart_${orderId}`);
      return [];
    }
    return parsed.items;
  } catch {
    return [];
  }
}

export function saveCart(orderId: string, items: CartItem[]): void {
  try {
    localStorage.setItem(
      `bistro_cart_${orderId}`,
      JSON.stringify({ items, expiresAt: Date.now() + CART_TTL_MS })
    );
  } catch {
    // localStorage may be unavailable in some contexts
  }
}

export function sanitizeInput(input: string): string {
  return input.trim().slice(0, 200).replace(/[<>&"']/g, "");
}

export function getNumericPrice(product: Product): number | null {
  if (product.variants && product.variants.length > 0) {
    return Math.min(...product.variants.map((v) => v.price));
  }
  if (product.price) return parseFloat(product.price);
  return null;
}

export function buildOrderMessage(cart: CartItem[]): string {
  const total = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const lines = cart.map((item) => {
    let line = `${item.quantity}x ${item.productName}`;
    if (item.selectedVariant) line += ` (${item.selectedVariant.name})`;
    if (item.modifications) line += ` – ${item.modifications}`;
    return `- ${line}`;
  });
  return `I'd like to order:\n${lines.join("\n")}\n\nTotal: €${total.toFixed(2)}`;
}

export async function fetchProducts(params: {
  category?: string | null;
  search?: string;
}): Promise<Product[]> {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (params.search) qs.set("search", params.search);
  const res = await fetch(`/api/products${qs.toString() ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`Products fetch failed: ${res.status}`);
  const data = (await res.json()) as { products: Product[] };
  return data.products ?? [];
}
