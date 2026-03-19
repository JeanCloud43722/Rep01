import fs from "fs";
import path from "path";
import { globSync } from "glob";
import { getDb } from "../db";
import { products, productSchema, PRODUCT_CATEGORIES, type ProductInput } from "../../shared/schema";
import { logger } from "./logger";
import { sql } from "drizzle-orm";

const MAX_PDF_SIZE_BYTES = 5 * 1024 * 1024;
const DEEPSEEK_TIMEOUT_MS = 25_000;
const CHUNK_MAX_CHARS = 12_000;
const KB_ROOT = path.join(process.cwd(), "knowledge-base");
const MAX_RETRIES = 2;

export interface ExtractionSummary {
  processed: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

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

const SYSTEM_PROMPT = `You are a menu data extractor for a restaurant system. Extract ALL menu items from the provided restaurant menu text (may be in German or English).

Return a JSON object with key "products" containing an array of items.

Each product must have:
- name: item name (keep original language, 1-150 chars)
- description: brief description in English, or null (max 300 chars)
- price: numeric price in euros (e.g. 12.50). Convert German format "12,00" → 12.0. Skip items without a clear price.
- category: one of [${PRODUCT_CATEGORIES.join(", ")}]
- allergens: string array, extract any allergen/ingredient info mentioned
- tags: string array from [vegetarian, vegan, gluten-free, spicy, popular, seasonal]
- image_url: null (always null)

Category guidance:
- Steaks, Rumpsteaks, Filet, T-Bone, Rib-Eye → "Steaks"
- Burger items → "Burgers"  
- Soups (Suppen) → "Soups"
- Starters, salads, appetizers (Vorspeisen, Salate) → "Starters"
- Ice cream cups, scoops, spaghetti eis, Eisbecher → "Ice Cream"
- Wine, beer, cocktails, soft drinks → "Drinks"
- Milkshakes, Eiskaffee → "Drinks"
- Pasta, Spaghetti dishes → "Pasta"
- Fish (Lachs, Fisch) → "Fish"
- Lamb (Lamm) → "Lamb"
- Vegetarian dishes → "Vegetarian"
- Side dishes, extras (Beilagen) → "Sides"
- Desserts → "Desserts"
- Anything else with a price → "Other"

IMPORTANT: Extract every item that has a price. Do not skip items.`;

async function callDeepSeekWithRetry(
  textChunk: string,
  attempt = 0
): Promise<ProductInput[]> {
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
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Extract products from this menu text:\n\n${textChunk}` },
        ],
        temperature: 0.1,
        max_tokens: 4000,
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
    return Array.isArray(arr) ? (arr as ProductInput[]) : [];
  } catch (err) {
    if (attempt < MAX_RETRIES - 1) {
      const delay = Math.pow(2, attempt) * 1000;
      logger.warn("DeepSeek call failed, retrying", {
        source: "extractor",
        attempt,
        delay,
        err: String(err),
      });
      await new Promise((r) => setTimeout(r, delay));
      return callDeepSeekWithRetry(textChunk, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function upsertProducts(
  db: ReturnType<typeof getDb>,
  items: ProductInput[],
  sourceFile: string,
  dryRun: boolean
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    const result = productSchema.safeParse(item);
    if (!result.success) {
      logger.warn("Product validation failed — skipped", {
        source: "extractor",
        name: item?.name,
        errors: result.error.flatten(),
      });
      skipped++;
      continue;
    }

    const p = result.data;
    if (dryRun) {
      logger.info(`[DRY RUN] Would upsert: ${p.name} (${p.category}) €${p.price}`, {
        source: "extractor",
      });
      inserted++;
      continue;
    }

    try {
      await (await db).insert(products).values({
        name: p.name,
        description: p.description ?? null,
        price: String(p.price.toFixed(2)),
        category: p.category,
        allergens: p.allergens ?? [],
        tags: p.tags ?? [],
        imageUrl: p.image_url ?? null,
        source: sourceFile,
      }).onConflictDoUpdate({
        target: [products.name, products.category],
        set: {
          price: String(p.price.toFixed(2)),
          description: p.description ?? null,
          allergens: p.allergens ?? [],
          tags: p.tags ?? [],
          updatedAt: new Date(),
        },
      });
      inserted++;
    } catch (err) {
      logger.warn("DB upsert failed", { source: "extractor", name: p.name, err: String(err) });
      skipped++;
    }
  }

  return { inserted, skipped };
}

export async function extractAll(dryRun = false): Promise<ExtractionSummary> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is not set");
  }

  const pdfFiles = globSync(`${KB_ROOT}/**/*.pdf`);
  logger.info("Starting product extraction", {
    source: "extractor",
    files: pdfFiles.length,
    dryRun,
  });

  const summary: ExtractionSummary = { processed: 0, inserted: 0, skipped: 0, errors: [] };
  const db = getDb();

  // Deduplication map: key = "name::category"
  const seenMap = new Map<string, ProductInput>();

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
    const fileItems: ProductInput[] = [];

    for (let i = 0; i < chunks.length; i++) {
      try {
        const items = await callDeepSeekWithRetry(chunks[i]);
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

    // Deduplicate within this file (keep most complete version)
    for (const item of fileItems) {
      const key = `${item.name?.toLowerCase()}::${item.category}`;
      const existing = seenMap.get(key);
      if (!existing || (!existing.description && item.description)) {
        seenMap.set(key, { ...item, source: relPath });
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
  for (const item of seenMap.values()) {
    const { inserted, skipped } = await upsertProducts(db, [item], item.source ?? "", dryRun);
    summary.inserted += inserted;
    summary.skipped += skipped;
  }

  logger.info("Extraction complete", {
    source: "extractor",
    ...summary,
  });

  return summary;
}
