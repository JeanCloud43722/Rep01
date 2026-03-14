import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import ws from "ws";
import * as schema from "../shared/schema";

neonConfig.webSocketConstructor = ws;

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("[DB] DATABASE_URL is not set — call validateEnvironment() first");
    _pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return _pool;
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export async function runMigrations(): Promise<void> {
  await migrate(getDb(), { migrationsFolder: "./migrations" });
  console.log("[DB] Migrations complete");
}

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
    console.log("[DB] Connection pool closed");
  }
}
