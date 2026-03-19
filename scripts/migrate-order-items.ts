import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Prompt 29: order_items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id          SERIAL PRIMARY KEY,
        order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        variant_name TEXT,
        quantity    INTEGER NOT NULL DEFAULT 1,
        modifications TEXT,
        price_at_time NUMERIC(10, 2) NOT NULL,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT order_items_qty_check CHECK (quantity > 0)
      )
    `);
    console.log("✓ order_items table created / already exists");

    await client.query(`
      CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id, product_id)
    `);
    console.log("✓ order_items_order_idx index created / already exists");

    // Prompt 29: idempotency_keys table
    await client.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key         TEXT PRIMARY KEY,
        order_id    TEXT NOT NULL,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("✓ idempotency_keys table created / already exists");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idempotency_order_idx ON idempotency_keys (order_id)
    `);
    console.log("✓ idempotency_order_idx index created / already exists");

    // Prompt 30.1: Stock validation columns for products
    // Add isActive column if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_active') THEN
          ALTER TABLE products ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
          CREATE INDEX products_active_idx ON products (is_active);
        END IF;
      END $$
    `);
    console.log("✓ is_active column added to products (if not already present)");

    // Add deactivatedAt column if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'deactivated_at') THEN
          ALTER TABLE products ADD COLUMN deactivated_at TIMESTAMP;
        END IF;
      END $$
    `);
    console.log("✓ deactivated_at column added to products (if not already present)");

    await client.query("COMMIT");
    console.log("\nMigration complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
