import fs from "fs";
import path from "path";
import { globSync } from "glob";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { products, productSchema, type ProductInput } from "../../shared/schema";
import { logger } from "./logger";
import { publishMenuEvent } from "./event-bus";
import { generatePlaceholderImage, resetImageGenCount } from "./generate-product-image";

const MAX_PDF_SIZE_BYTES = 5 * 1024 * 1024;
const DEEPSEEK_TIMEOUT_MS = 60_000;
const CHUNK_MAX_CHARS = 3_500;
const KB_ROOT = path.join(process.cwd(), "knowledge-base");
const MAX_RETRIES = 1;

export interface ExtractionSummary {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// ─── OPT-6: pdf-parse now typed via types/global.d.ts ────────────────────────
async function extractTextFromPdf(pdfPath: string): Promise<string> {
  try {
    const buf = fs.readFileSync(pdfPath);
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buf);
    return data.text.trim();
  } catch (err) {
    logger.warn("PDF parse failed", { source: "extractor", file: pdfPath, err: String(err) });
    return "";
  }
}

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_MAX_CHARS) return [text];
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if ((current + para).length > CHUNK_MAX_CHARS && current.length > 0) {
      chunks.push(current.trim());
      current = para + "\n\n";
    } else {
      current += para + "\n\n";
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ─── OPT-1: Dynamic system prompt — no hardcoded category enum ───────────────
function buildSystemPrompt(existingProductsContext?: Array<{ id: number; name: string }>): string {
  const existingSection = existingProductsContext && existingProductsContext.length > 0
    ? `\nEXISTING PRODUCTS IN DATABASE (for fuzzy deduplication):\n${
        existingProductsContext.map((p) => `- "${p.name}" (id: ${p.id})`).join("\n")
      }\n\nINSTRUCTIONS FOR DEDUPLICATION:\n- If the extracted item is semantically identical to an existing product (e.g., "Spag. Bolo" ≈ "Spaghetti Bolognese"), use the EXACT existing name and return existingProductId.\n- If it is a genuinely new product, omit existingProductId.\n`
    : "";

  return `You are a menu data extractor for a restaurant POS system. Extract ALL menu items from the provided text (may be in German or English).

Return a JSON object with key "products" containing an array of items.

Each product must have:
- name: string (1-150 chars, keep original language)
- description: string or null (max 300 chars)
- category: string — use EXACT section header from the menu (e.g. "Antipasti", "Hauptgerichte"). Do NOT map to predefined categories.
- categoryGroup: string or null — higher-level grouping (e.g. "Main Courses"), or null if unclear
- price: number — single price in euros if only one size (convert "12,50" → 12.5). Omit if using variants.
- variants: array of {name, price, description?} — for size/type-based pricing (e.g. Small/Large, 200g/400g). Omit if single price.
- defaultVariant: string — which variant name to show first (only if variants present)
- allergens: string array — extract any allergen/ingredient information
- tags: string array — only from: ["vegetarian", "vegan", "gluten-free", "spicy", "popular", "seasonal"]
- image_url: null (always null)
- existingProductId: number — ONLY if this matches an existing product from the deduplication list above
${existingSection}
RULES:
1. Every item must have price OR variants (not both — prefer variants for multi-size items)
2. Do NOT skip items that have a price
3. Category must be the exact section name from the PDF layout
4. For size variants example: {"name":"Pizza Margherita","variants":[{"name":"Small","price":8.00},{"name":"Large","price":12.00}],"defaultVariant":"Small"}`;
}

// ─── OPT-2: Fetch existing products for fuzzy deduplication context ───────────
async function getExistingProductsForContext(
  db: ReturnType<typeof getDb>,
  category: string
): Promise<Array<{ id: number; name: string }>> {
  try {
    const rows = await (await db)
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.category, category))
      .limit(100);
    return rows as Array<{ id: number; name: string }>;
  } catch {
    return [];
  }
}

// ─── DeepSeek call with retry + optional existing-products context ─────────────
async function callDeepSeekWithRetry(
  textChunk: string,
  existingProducts?: Array<{ id: number; name: string }>,
  attempt = 0
): Promise<unknown[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: buildSystemPrompt(existingProducts) },
          { role: "user", content: `Extract products from this menu text:\n\n${textChunk}` },
        ],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API ${response.status}: ${await response.text().catch(() => "")}`);
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = result.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content) as { products?: unknown };
    const arr = Array.isArray(parsed) ? parsed : (parsed?.products ?? []);
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    if (attempt < MAX_RETRIES - 1) {
      const delay = Math.pow(2, attempt) * 1000;
      logger.warn("DeepSeek call failed, retrying", { source: "extractor", attempt, delay, err: String(err) });
      await new Promise((r) => setTimeout(r, delay));
      return callDeepSeekWithRetry(textChunk, existingProducts, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── OPT-2 + OPT-3 + OPT-5: Upsert with fuzzy mapping, variants, async images ─
async function upsertProducts(
  db: ReturnType<typeof getDb>,
  items: unknown[],
  sourceFile: string,
  dryRun: boolean,
  skipImages: boolean
): Promise<{ inserted: number; updated: number; skipped: number; changedIds: number[] }> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const changedIds: number[] = [];

  for (const item of items) {
    const result = productSchema.safeParse(item);
    if (!result.success) {
      logger.warn("Product validation failed — skipped", {
        source: "extractor",
        name: (item as Record<string, unknown>)?.name,
        errors: result.error.flatten(),
      });
      skipped++;
      continue;
    }

    const p = result.data;
    const priceStr = p.price !== undefined ? String(p.price.toFixed(2)) : null;

    if (dryRun) {
      const priceDisplay = p.variants
        ? `variants[${p.variants.map((v) => `${v.name}:€${v.price}`).join(",")}]`
        : `€${p.price}`;
      logger.info(`[DRY RUN] Would upsert: ${p.name} (category: ${p.category}) ${priceDisplay}`, {
        source: "extractor",
      });
      inserted++;
      continue;
    }

    try {
      let rowId: number | undefined;

      // OPT-2: If DeepSeek identified an existing product match, UPDATE by ID
      if (p.existingProductId) {
        const existing = await (await db)
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(eq(products.id, p.existingProductId))
          .limit(1);

        if (existing.length > 0) {
          await (await db)
            .update(products)
            .set({
              price: priceStr ?? undefined,
              description: p.description ?? null,
              allergens: p.allergens ?? [],
              tags: p.tags ?? [],
              variants: p.variants ?? null,
              defaultVariant: p.defaultVariant ?? null,
              categoryGroup: p.categoryGroup ?? null,
              updatedAt: new Date(),
            })
            .where(eq(products.id, p.existingProductId));

          rowId = p.existingProductId;
          updated++;
          logger.info(`Mapped "${p.name}" → existing ID ${p.existingProductId} (${existing[0].name})`, {
            source: "extractor",
          });
          changedIds.push(rowId);
          continue;
        }
      }

      // INSERT with ON CONFLICT (name, category) fallback update
      const inserted_row = await (await db)
        .insert(products)
        .values({
          name: p.name,
          description: p.description ?? null,
          price: priceStr,
          category: p.category,
          categoryGroup: p.categoryGroup ?? null,
          allergens: p.allergens ?? [],
          tags: p.tags ?? [],
          variants: p.variants ?? null,
          defaultVariant: p.defaultVariant ?? null,
          imageUrl: p.image_url ?? null,
          source: sourceFile,
        })
        .onConflictDoUpdate({
          target: [products.name, products.category],
          set: {
            price: priceStr ?? undefined,
            description: p.description ?? null,
            allergens: p.allergens ?? [],
            tags: p.tags ?? [],
            variants: p.variants ?? null,
            defaultVariant: p.defaultVariant ?? null,
            categoryGroup: p.categoryGroup ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: products.id });

      rowId = inserted_row[0]?.id;
      if (rowId) changedIds.push(rowId);
      inserted++;

      // OPT-5: Fire-and-forget async image generation for products without images
      if (rowId && !p.image_url && !skipImages) {
        const capturedId = rowId;
        generatePlaceholderImage({ name: p.name, description: p.description, category: p.category })
          .then(async (imageUrl) => {
            if (imageUrl) {
              const resolvedDb = await db;
              await resolvedDb
                .update(products)
                .set({ imageUrl })
                .where(eq(products.id, capturedId));
              publishMenuEvent({ type: "PRODUCT_IMAGE_ADDED", productId: capturedId, imageUrl });
              logger.info("[ImageGen] Image saved", { source: "imagegen", productId: capturedId });
            }
          })
          .catch((err) => logger.error("[ImageGen] Background job failed", { source: "imagegen", err: String(err) }));
      }
    } catch (err) {
      logger.warn("DB upsert failed", { source: "extractor", name: p.name, err: String(err) });
      skipped++;
    }
  }

  return { inserted, updated, skipped, changedIds };
}

// ─── Main orchestration with OPT-4: WebSocket broadcast after completion ──────
export async function extractAll(
  dryRun = false,
  skipImages = false,
  filterCategory?: string
): Promise<ExtractionSummary> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is not set");
  }

  resetImageGenCount();

  const pdfFiles = globSync(`${KB_ROOT}/**/*.pdf`);
  logger.info("Starting product extraction", {
    source: "extractor",
    files: pdfFiles.length,
    dryRun,
    skipImages,
    filterCategory: filterCategory ?? "all",
  });

  const summary: ExtractionSummary = { processed: 0, inserted: 0, updated: 0, skipped: 0, errors: [] };
  const db = getDb();
  const allChangedIds: number[] = [];

  // Deduplication map across all files: key = "name::category"
  const seenMap = new Map<string, unknown>();

  for (const filePath of pdfFiles) {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_PDF_SIZE_BYTES) {
      logger.warn("PDF exceeds size limit — skipped", {
        source: "extractor",
        file: filePath,
        sizeMB: (stat.size / 1024 / 1024).toFixed(1),
      });
      summary.errors.push(`${path.basename(filePath)}: exceeds 5MB limit`);
      continue;
    }

    const relPath = path.relative(process.cwd(), filePath);
    logger.info("Processing PDF", { source: "extractor", file: relPath });

    const text = await extractTextFromPdf(filePath);
    if (!text) {
      summary.errors.push(`${path.basename(filePath)}: empty text`);
      continue;
    }

    const chunks = chunkText(text);
    const fileItems: unknown[] = [];

    for (let i = 0; i < chunks.length; i++) {
      try {
        // OPT-2: Build context from existing products for fuzzy dedup
        // We use a placeholder category here; the actual category comes from DeepSeek
        const existingCtx = await getExistingProductsForContext(db, filterCategory ?? "");
        const items = await callDeepSeekWithRetry(chunks[i], existingCtx.length > 0 ? existingCtx : undefined);
        fileItems.push(...items);
        logger.info("Chunk extracted", {
          source: "extractor",
          file: relPath,
          chunk: `${i + 1}/${chunks.length}`,
          items: items.length,
        });
      } catch (err) {
        const msg = `${path.basename(filePath)} chunk ${i + 1}: ${String(err)}`;
        summary.errors.push(msg);
        logger.warn("Chunk extraction failed", { source: "extractor", msg });
      }
    }

    // Deduplicate within run (keep most complete version)
    for (const item of fileItems) {
      const raw = item as Record<string, unknown>;
      const name = String(raw.name ?? "").toLowerCase().trim();
      const category = String(raw.category ?? "").toLowerCase().trim();

      // Apply category filter if specified
      if (filterCategory && category !== filterCategory.toLowerCase()) continue;

      const key = `${name}::${category}`;
      const existing = seenMap.get(key) as Record<string, unknown> | undefined;
      if (!existing || (!existing.description && raw.description)) {
        seenMap.set(key, { ...raw, source: relPath });
      }
    }

    summary.processed++;
    logger.info("PDF complete", {
      source: "extractor",
      file: relPath,
      rawItems: fileItems.length,
      progress: `${summary.processed}/${pdfFiles.length}`,
    });
  }

  // Upsert all deduplicated items
  for (const item of Array.from(seenMap.values())) {
    const result = await upsertProducts(db, [item], (item as Record<string, unknown>).source as string ?? "", dryRun, skipImages);
    summary.inserted += result.inserted;
    summary.updated += result.updated;
    summary.skipped += result.skipped;
    allChangedIds.push(...result.changedIds);
  }

  logger.info("Extraction complete", { source: "extractor", ...summary });

  // OPT-4: Broadcast MENU_UPDATED to all connected WebSocket clients
  if (!dryRun && allChangedIds.length > 0) {
    publishMenuEvent({
      type: "MENU_UPDATED",
      timestamp: new Date().toISOString(),
      summary: { inserted: summary.inserted, updated: summary.updated, skipped: summary.skipped },
      changedProductIds: allChangedIds,
    });
    logger.info("[WebSocket] MENU_UPDATED broadcast", { source: "extractor", changedProducts: allChangedIds.length });
  }

  return summary;
}
