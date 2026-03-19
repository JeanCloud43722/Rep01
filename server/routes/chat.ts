import type { Express, Request, Response } from "express";
import { getDb } from "../db";
import { orderItems, idempotencyKeys, products } from "../../shared/schema";
import { eq, and, gt, inArray } from "drizzle-orm";
import {
  searchProductsTool,
  executeSearchProducts,
  orderHasDrink,
  ORDERING_SYSTEM_PROMPT,
} from "../lib/chat-tools";
import { aiRateLimiter } from "../middleware/rate-limit";
import { sanitizeInput } from "../lib/sanitize";
import { getConfig } from "../env-validation";
import { logger } from "../lib/logger";
import { publishOrderEvent } from "../lib/event-bus";
import { storage } from "../storage";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_TOOL_ITERATIONS = 3;
const DEEPSEEK_TIMEOUT_MS = 25_000;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY_MESSAGES = 10;
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeepSeekMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: ToolCall[];
    };
  }>;
}

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

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function callDeepSeek(
  payload: object,
  signal: AbortSignal
): Promise<{ content: string | null; tool_calls: ToolCall[] | null }> {
  const config = getConfig();
  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.deepseekApiKey}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`DeepSeek API error: ${response.status} ${body}`);
  }

  const data = (await response.json()) as DeepSeekResponse;
  const msg = data.choices?.[0]?.message;
  return {
    content: msg?.content ?? null,
    tool_calls: msg?.tool_calls ?? null,
  };
}

function extractOrderPreview(text: string): OrderPreview | null {
  // Match ```json ... ``` code blocks first, then bare JSON
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = codeBlock ? codeBlock[1] : text;

  try {
    const parsed = JSON.parse(raw.trim()) as unknown;
    return validateOrderPreview(parsed) ? parsed : null;
  } catch {
    // Try to find JSON object anywhere in text
    const jsonMatch = text.match(/\{[\s\S]*"intent"[\s\S]*"order"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as unknown;
        return validateOrderPreview(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function validateOrderPreview(obj: unknown): obj is OrderPreview {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    o.intent === "order" &&
    Array.isArray(o.items) &&
    o.items.length > 0 &&
    o.items.every(
      (i) =>
        typeof (i as Record<string, unknown>).product_id === "number" &&
        typeof (i as Record<string, unknown>).quantity === "number"
    )
  );
}

// ─── Route setup ──────────────────────────────────────────────────────────────

export function setupChatRoutes(app: Express): void {
  /**
   * POST /api/orders/:orderId/chat
   * AI ordering chat with DeepSeek function-calling (search_products tool).
   * Max 3 tool iterations, 25 s timeout, drink upsell when food-only order.
   */
  app.post(
    "/api/orders/:orderId/chat",
    aiRateLimiter,
    async (req: Request, res: Response) => {
      const { orderId } = req.params;
      const { message, history } = req.body as {
        message?: string;
        history?: Array<{ role: "user" | "assistant"; content: string }>;
      };

      if (!message || typeof message !== "string" || message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({
          error: { code: "INVALID_INPUT", message: "message required, max 2000 chars" },
        });
      }

      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      const config = getConfig();
      if (!config.deepseekApiKey) {
        return res.status(200).json({
          reply: "AI ordering is currently unavailable. Please ask a staff member for help.",
          order_preview: null,
          meta: { error: "no_api_key" },
        });
      }

      // Build message list
      const recentHistory: DeepSeekMessage[] = (
        Array.isArray(history) ? history.slice(-MAX_HISTORY_MESSAGES) : []
      ).map((h) => ({ role: h.role, content: h.content }));

      const messages: DeepSeekMessage[] = [
        { role: "system", content: ORDERING_SYSTEM_PROMPT },
        ...recentHistory,
        { role: "user", content: message },
      ];

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

      let iteration = 0;
      let finalReply = "";
      let orderPreview: OrderPreview | null = null;

      try {
        while (iteration < MAX_TOOL_ITERATIONS) {
          const response = await callDeepSeek(
            {
              model: "deepseek-chat",
              messages,
              tools: [searchProductsTool],
              tool_choice: "auto",
              temperature: 0.1,
              max_tokens: 1_000,
            },
            controller.signal
          );

          if (response.tool_calls && response.tool_calls.length > 0) {
            // Append assistant message with tool_calls
            messages.push({
              role: "assistant",
              content: response.content ?? "",
              tool_calls: response.tool_calls,
            });

            // Execute each tool call and append results
            for (const tc of response.tool_calls) {
              if (tc.function.name === "search_products") {
                let args: { query: string; limit?: number } = { query: message };
                try {
                  args = JSON.parse(tc.function.arguments) as typeof args;
                } catch {
                  // use default
                }

                logger.debug("Chat: search_products", {
                  source: "chat",
                  orderId,
                  query: args.query,
                });

                const results = await executeSearchProducts(
                  sanitizeInput(args.query),
                  args.limit ?? 10
                );

                messages.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  content: JSON.stringify(results),
                } as DeepSeekMessage);
              }
            }

            iteration++;
            continue;
          }

          // No tool calls — this is the final reply
          finalReply = response.content ?? "";
          orderPreview = extractOrderPreview(finalReply);
          break;
        }
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        const name = (err as { name?: string }).name;
        if (name === "AbortError") {
          logger.warn("DeepSeek chat timeout", { source: "chat", orderId });
          return res.status(200).json({
            reply:
              "Sorry, I'm taking longer than usual. Could you rephrase your order or try again in a moment?",
            order_preview: null,
            meta: { error: "timeout" },
          });
        }
        logger.error("DeepSeek chat error", {
          source: "chat",
          orderId,
          error: String(err),
        });
        throw err;
      }

      clearTimeout(timeoutId);

      // Max iterations reached without final reply
      if (iteration >= MAX_TOOL_ITERATIONS && !finalReply) {
        return res.status(200).json({
          reply:
            "I want to get your order exactly right — could you clarify which items or sizes you'd like?",
          order_preview: null,
          meta: { iterations_used: iteration },
        });
      }

      // Intelligent upselling: if order is complete and food-only, suggest a drink
      if (
        orderPreview &&
        !orderPreview.requires_clarification &&
        orderPreview.items.length > 0
      ) {
        try {
          const productIds = Array.from(new Set(orderPreview.items.map((i) => i.product_id)));
          const hasDrink = await orderHasDrink(productIds);
          if (!hasDrink) {
            finalReply +=
              "\n\nWould you also like to add a drink? We have a great selection of soft drinks, juices, and more.";
          }
        } catch {
          // Non-critical — continue without upsell
        }
      }

      logger.info("Chat response generated", {
        source: "chat",
        orderId,
        iterations: iteration,
        hasOrder: !!orderPreview,
      });

      return res.status(200).json({
        reply: finalReply,
        order_preview: orderPreview,
        meta: { iterations_used: iteration, has_order_json: !!orderPreview },
      });
    }
  );

  /**
   * POST /api/orders/:orderId/confirm-order
   * Server-side price validation + idempotency + transactional insert into order_items.
   * NEVER trusts client-supplied unit_price.
   */
  app.post(
    "/api/orders/:orderId/confirm-order",
    async (req: Request, res: Response) => {
      const { orderId } = req.params;
      const { idempotencyKey, items } = req.body as {
        idempotencyKey?: string;
        items?: Array<{
          product_id: number;
          variant_name?: string;
          quantity: number;
          modifications?: string;
        }>;
      };

      // Validate idempotency key (UUID v4 shape)
      if (
        !idempotencyKey ||
        typeof idempotencyKey !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          idempotencyKey
        )
      ) {
        return res.status(400).json({
          error: { code: "INVALID_IDEMPOTENCY_KEY", message: "UUID v4 required" },
        });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          error: { code: "INVALID_ITEMS", message: "At least one item required" },
        });
      }

      // Verify order exists
      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      const db = getDb();

      // Idempotency check: reject if key was already used within the last 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const [existingKey] = await db
        .select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.key, idempotencyKey),
            gt(idempotencyKeys.createdAt, tenMinutesAgo)
          )
        )
        .limit(1);

      if (existingKey) {
        logger.info("Duplicate order confirmation rejected", {
          source: "chat",
          orderId,
          idempotencyKey,
        });
        return res.status(200).json({ duplicate: true });
      }

      // Server-side price resolution — NEVER trust client unit_price
      const resolvedItems: Array<{
        productId: number;
        variantName: string | null;
        quantity: number;
        modifications: string | null;
        priceAtTime: string;
      }> = [];

      for (const item of items) {
        const productId = Number(item.product_id);
        if (!Number.isInteger(productId) || productId <= 0) {
          return res.status(400).json({
            error: {
              code: "INVALID_PRODUCT_ID",
              message: `Invalid product_id: ${item.product_id}`,
            },
          });
        }

        const qty = Number(item.quantity);
        if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
          return res.status(400).json({
            error: { code: "INVALID_QUANTITY", message: "Quantity must be 1–99" },
          });
        }

        const [product] = await db
          .select()
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);

        if (!product) {
          return res.status(400).json({
            error: {
              code: "PRODUCT_NOT_FOUND",
              message: `Product ${productId} not found`,
            },
          });
        }

        // ────── CRITICAL: Stock validation (Prompt 30.1) ──────
        if (product.isActive === false) {
          return res.status(400).json({
            error: {
              code: "ITEM_UNAVAILABLE",
              message: `${product.name} is no longer available`,
              itemName: product.name,
              productId: product.id,
              deactivatedAt: product.deactivatedAt,
            },
          });
        }

        const variantName = item.variant_name ? String(item.variant_name) : null;
        let resolvedPrice: number | null = null;

        if (product.variants && product.variants.length > 0) {
          if (variantName) {
            const variant = product.variants.find(
              (v) => v.name.toLowerCase() === variantName.toLowerCase()
            );
            if (!variant) {
              return res.status(400).json({
                error: {
                  code: "INVALID_VARIANT",
                  message: `Variant "${variantName}" not found for "${product.name}"`,
                },
              });
            }
            resolvedPrice = variant.price;
          } else {
            // No variant specified but product has variants — use default if set
            const def = product.variants.find(
              (v) => v.name === (product.defaultVariant ?? "")
            );
            if (def) {
              resolvedPrice = def.price;
            } else {
              resolvedPrice = product.variants[0].price;
            }
          }
        } else if (product.price) {
          resolvedPrice = parseFloat(product.price);
        }

        if (resolvedPrice === null) {
          return res.status(400).json({
            error: {
              code: "NO_PRICE",
              message: `Cannot determine price for "${product.name}"`,
            },
          });
        }

        resolvedItems.push({
          productId,
          variantName,
          quantity: qty,
          modifications: item.modifications
            ? sanitizeInput(String(item.modifications))
            : null,
          priceAtTime: resolvedPrice.toFixed(2),
        });
      }

      // Atomic transaction: store idempotency key + order items
      try {
        const inserted = await db.transaction(async (tx) => {
          await tx.insert(idempotencyKeys).values({
            key: idempotencyKey,
            orderId,
          });

          const rows = await tx
            .insert(orderItems)
            .values(
              resolvedItems.map((r) => ({
                orderId,
                productId: r.productId,
                variantName: r.variantName,
                quantity: r.quantity,
                modifications: r.modifications,
                priceAtTime: r.priceAtTime,
              }))
            )
            .returning();

          return rows;
        });

        // Broadcast to admin via event bus
        publishOrderEvent({
          type: "ORDER_CONFIRMED",
          orderId,
          items: inserted,
          timestamp: new Date().toISOString(),
        });

        logger.info("Order confirmed", {
          source: "chat",
          orderId,
          itemCount: inserted.length,
        });

        return res.status(200).json({ success: true, order_items: inserted });
      } catch (err) {
        logger.error("Order confirmation transaction failed", {
          source: "chat",
          orderId,
          error: String(err),
        });
        throw err;
      }
    }
  );

  /**
   * GET /api/orders/:orderId/order-items
   * Fetch all confirmed order items for a given order (admin view).
   */
  app.get(
    "/api/orders/:orderId/order-items",
    async (req: Request, res: Response) => {
      const { orderId } = req.params;
      const db = getDb();

      const rows = await db
        .select({
          id: orderItems.id,
          productId: orderItems.productId,
          variantName: orderItems.variantName,
          quantity: orderItems.quantity,
          modifications: orderItems.modifications,
          priceAtTime: orderItems.priceAtTime,
          createdAt: orderItems.createdAt,
          productName: products.name,
          productCategory: products.category,
        })
        .from(orderItems)
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, orderId));

      return res.status(200).json({ order_items: rows });
    }
  );
}
