#!/usr/bin/env tsx
/**
 * Product extraction CLI
 * Usage:
 *   npx tsx scripts/extract-products.ts                          # real run
 *   npx tsx scripts/extract-products.ts --dry-run                # preview only
 *   npx tsx scripts/extract-products.ts --skip-images            # skip image gen
 *   npx tsx scripts/extract-products.ts --category "vorspeisen"  # filter by category
 *   npx tsx scripts/extract-products.ts --dry-run --category starters
 */
import { parseArgs } from "node:util";
import { validateEnvironment } from "../server/env-validation";
import { extractAll } from "../server/lib/extract-products";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "dry-run": { type: "boolean", default: false },
    "skip-images": { type: "boolean", default: false },
    "category": { type: "string", default: undefined },
  },
});

async function main() {
  validateEnvironment();

  if (!process.env.DEEPSEEK_API_KEY) {
    console.error("DEEPSEEK_API_KEY not set in Secrets");
    process.exit(1);
  }

  const dryRun = values["dry-run"] as boolean;
  const skipImages = values["skip-images"] as boolean;
  const category = values["category"] as string | undefined;

  const flags = [
    dryRun && "DRY RUN",
    skipImages && "SKIP IMAGES",
    category && `CATEGORY=${category}`,
  ]
    .filter(Boolean)
    .join(", ");

  console.log(`\nStarting product extraction${flags ? ` (${flags})` : ""}...\n`);

  const summary = await extractAll(dryRun, skipImages, category);

  console.log("\nExtraction complete:");
  console.log(`   PDFs processed : ${summary.processed}`);
  console.log(`   Inserted       : ${summary.inserted}`);
  console.log(`   Updated        : ${summary.updated}`);
  console.log(`   Skipped        : ${summary.skipped}`);
  if (summary.errors.length > 0) {
    console.log(`   Errors (${summary.errors.length}):`);
    summary.errors.forEach((e) => console.log(`     - ${e}`));
  }

  process.exit(summary.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
