import { getDb } from "../db";
import { products } from "../../shared/schema";
import { ilike, or, eq, sql, inArray } from "drizzle-orm";

// ─── DeepSeek function-calling tool definition ────────────────────────────────

export const searchProductsTool = {
  type: "function" as const,
  function: {
    name: "search_products",
    description:
      "Search restaurant products by name, category, or tag. Returns full product data including variants for order construction.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: 'Search query, e.g. "vegetarian pizza" or "large cola"',
        },
        limit: {
          type: "integer",
          description: "Max results to return (default: 10)",
          default: 10,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

// ─── System prompt used in all ordering chat calls ────────────────────────────

export const ORDERING_SYSTEM_PROMPT = `You are a friendly AI ordering assistant for Bistro Buzzer restaurant. Help customers place food and drink orders accurately and securely.

RULES:
1. When a customer mentions menu items, use the search_products tool to find exact products with current prices and variants.
2. If a product has multiple size or type variants and the customer has NOT specified one, ALWAYS ask which variant they prefer before building the order.
3. Once all items are identified (products found, variants confirmed, quantities clear), output the complete order as a JSON code block EXACTLY like this:

\`\`\`json
{
  "intent": "order",
  "items": [
    {
      "product_id": 42,
      "product_name": "Pizza Margherita",
      "variant_name": "Large",
      "quantity": 1,
      "modifications": "no onions",
      "unit_price": 12.00
    }
  ],
  "requires_clarification": false
}
\`\`\`

4. If any information is unclear or a product cannot be found, set "requires_clarification": true in the JSON and ask the customer.
5. NEVER invent prices — only use prices from the search_products tool results.
6. Handle cart injection format from the customer menu: if the customer sends "I'd like to order: 1x Item (Variant) …", verify each item via search_products before confirming.
7. Respond in the exact same language as the customer (German if they write German, English otherwise).
8. Be warm, concise, and professional.`;

// ─── Tool execution ────────────────────────────────────────────────────────────

export interface ProductSearchResult {
  id: number;
  name: string;
  category: string;
  price: number | null;
  variants: Array<{ name: string; price: number; description?: string }> | null;
  allergens: string[];
  tags: string[];
}

export async function executeSearchProducts(
  query: string,
  limit = 10
): Promise<ProductSearchResult[]> {
  const db = getDb();

  // Parameterised query – ilike uses $-bindings internally in Drizzle
  const rows = await db
    .select()
    .from(products)
    .where(
      or(
        ilike(products.name, `%${query}%`),
        ilike(products.description, `%${query}%`),
        eq(products.category, query),
        sql`${query} = ANY(${products.tags})`
      )
    )
    .limit(Math.min(limit, 50));

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price ? Number(p.price) : null,
    variants: p.variants ?? null,
    allergens: p.allergens,
    tags: p.tags,
  }));
}

// ─── Helpers for drink detection (upselling) ─────────────────────────────────

const DRINK_KEYWORDS = [
  "drink",
  "drinks",
  "beverage",
  "beverages",
  "getränke",
  "getränk",
  "soft drink",
  "cola",
  "water",
  "wasser",
  "juice",
  "saft",
  "beer",
  "bier",
  "wine",
  "wein",
];

export async function orderHasDrink(productIds: number[]): Promise<boolean> {
  if (productIds.length === 0) return false;
  const db = getDb();
  const rows = await db
    .select({ category: products.category, tags: products.tags })
    .from(products)
    .where(inArray(products.id, productIds));

  return rows.some((p) => {
    const cat = (p.category ?? "").toLowerCase();
    const tags = (p.tags ?? []).map((t) => t.toLowerCase());
    return (
      DRINK_KEYWORDS.some((kw) => cat.includes(kw)) ||
      tags.some((t) => DRINK_KEYWORDS.some((kw) => t.includes(kw)))
    );
  });
}
