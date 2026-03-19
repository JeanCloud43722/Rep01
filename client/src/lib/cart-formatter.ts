export interface CartLineItem {
  productName: string;
  quantity: number;
  selectedVariant?: { name: string; price: number } | null;
  modifications?: string;
  unitPrice: number;
}

export function formatCartToChatMessage(cart: CartLineItem[]): string {
  if (cart.length === 0) return "";
  const total = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const lines = cart.map((item) => {
    let line = `${item.quantity}x ${item.productName}`;
    if (item.selectedVariant) line += ` (${item.selectedVariant.name})`;
    if (item.modifications) line += ` \u2013 ${item.modifications}`;
    return `- ${line}`;
  });
  return `I'd like to order:\n${lines.join("\n")}\n\nTotal: \u20ac${total.toFixed(2)}`;
}
