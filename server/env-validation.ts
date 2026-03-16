import crypto from "crypto";
import { logger } from "./lib/logger";

export interface AppConfig {
  databaseUrl: string;
  vapidPublicKey: string | undefined;
  vapidPrivateKey: string | undefined;
  deepseekApiKey: string | undefined;
  serpApiKey: string | undefined;
  googleSearchApiKey: string | undefined;
  googleSearchEngineId: string | undefined;
  port: number;
  nodeEnv: "development" | "production" | undefined;
  sessionSecret: string;
  allowedOrigin: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

let _config: AppConfig | null = null;

export function validateEnvironment(): AppConfig {
  const errors: string[] = [];

  // DATABASE_URL — required
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    errors.push("DATABASE_URL is required. Add a PostgreSQL database in Replit (Tools → Database).");
  }

  if (errors.length > 0) {
    logger.error("Environment validation failed", { errors });
    process.exit(1);
  }

  // VAPID keys — optional but warn prominently
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || undefined;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || undefined;
  if (!vapidPublicKey || !vapidPrivateKey) {
    logger.warn("Ephemeral VAPID keys will be generated. Push subscriptions will NOT survive restarts.", { source: "config" });
  }

  // DEEPSEEK_API_KEY — optional; AI features disabled without it
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY || undefined;
  if (!deepseekApiKey) {
    logger.info("DEEPSEEK_API_KEY not set — AI features will be disabled.", { source: "config" });
  }

  // Web search keys — optional; web search disabled without them
  const serpApiKey = process.env.SERPAPI_API_KEY || undefined;
  const googleSearchApiKey = process.env.GOOGLE_SEARCH_API_KEY || undefined;
  const googleSearchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID || undefined;
  if (!serpApiKey && !googleSearchApiKey) {
    logger.info("No web search API keys set — guest assistant will rely on knowledge base only.", { source: "config" });
  }

  // PORT — optional, default 5000, must be 1–65535
  const rawPort = process.env.PORT;
  let port = 5000;
  if (rawPort !== undefined) {
    const parsed = parseInt(rawPort, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
      logger.warn(`PORT "${rawPort}" is invalid — falling back to 5000.`, { source: "config" });
    } else {
      port = parsed;
    }
  }

  // NODE_ENV — optional, must be development|production if set
  const rawNodeEnv = process.env.NODE_ENV;
  let nodeEnv: "development" | "production" | undefined;
  if (rawNodeEnv !== undefined) {
    if (rawNodeEnv === "development" || rawNodeEnv === "production") {
      nodeEnv = rawNodeEnv;
    } else {
      logger.warn(`NODE_ENV "${rawNodeEnv}" is not recognised — must be development or production.`, { source: "config" });
    }
  }

  // SESSION_SECRET — optional but warn; generate 64-char hex fallback
  let sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    sessionSecret = crypto.randomBytes(32).toString("hex");
    logger.warn("SESSION_SECRET not set — using a random secret. Sessions will be invalidated on restart.", { source: "config" });
  }

  // ALLOWED_ORIGIN — optional, default covers Replit preview domains
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*.replit.app,*.repl.co";

  // LOG_LEVEL — optional, default info
  const validLogLevels = ["debug", "info", "warn", "error"] as const;
  const rawLogLevel = process.env.LOG_LEVEL;
  let logLevel: AppConfig["logLevel"] = "info";
  if (rawLogLevel !== undefined) {
    if (validLogLevels.includes(rawLogLevel as AppConfig["logLevel"])) {
      logLevel = rawLogLevel as AppConfig["logLevel"];
    } else {
      logger.warn(`LOG_LEVEL "${rawLogLevel}" is invalid — must be debug|info|warn|error. Defaulting to info.`, { source: "config" });
    }
  }

  _config = {
    databaseUrl: databaseUrl!,
    vapidPublicKey,
    vapidPrivateKey,
    deepseekApiKey,
    serpApiKey,
    googleSearchApiKey,
    googleSearchEngineId,
    port,
    nodeEnv,
    sessionSecret,
    allowedOrigin,
    logLevel,
  };

  logger.info("Environment validated", { source: "config", port, nodeEnv: nodeEnv ?? "unset", logLevel });
  return _config;
}

export function getConfig(): AppConfig {
  if (!_config) throw new Error("validateEnvironment() must be called before getConfig()");
  return _config;
}
