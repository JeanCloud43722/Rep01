#!/usr/bin/env tsx
/**
 * Product extraction CLI
 * Usage:
 *   npx tsx scripts/extract-products.ts           # real run
 *   npx tsx scripts/extract-products.ts --dry-run  # preview only
 */
import { parseArgs } from "node:util";
import { validateEnvironment } from "../server/env-validation";
import { extractAll } from "../server/lib/extract-products";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "dry-run": { type: "boolean", default: false },
  },
});

async function main() {
  validateEnvironment();

  if (!process.env.DEEPSEEK_API_KEY) {
    console.error("❌ DEEPSEEK_API_KEY not set in Secrets");
    process.exit(1);
  }

  console.log(`\n🚀 Starting product extraction${values["dry-run"] ? " (DRY RUN)" : ""}...\n`);

  const summary = await extractAll(values["dry-run"]);

  console.log("\n✅ Extraction complete:");
  console.log(`   PDFs processed : ${summary.processed}`);
  console.log(`   Products ${values["dry-run"] ? "found  " : "upserted"} : ${summary.inserted}`);
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
