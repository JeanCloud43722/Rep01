import crypto from "crypto";

export interface AppConfig {
  databaseUrl: string;
  vapidPublicKey: string | undefined;
  vapidPrivateKey: string | undefined;
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
    console.error("[Config] ❌ Environment validation failed:");
    errors.forEach((e) => console.error(`  • ${e}`));
    process.exit(1);
  }

  // VAPID keys — optional but warn prominently
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || undefined;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || undefined;
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("[Config] ⚠️  Ephemeral VAPID keys generated. Push subscriptions will NOT survive restarts.");
    console.warn("[Config]    Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Replit Secrets for persistent push.");
  }

  // PORT — optional, default 5000, must be 1–65535
  const rawPort = process.env.PORT;
  let port = 5000;
  if (rawPort !== undefined) {
    const parsed = parseInt(rawPort, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
      console.warn(`[Config] PORT "${rawPort}" is invalid — falling back to 5000.`);
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
      console.warn(`[Config] NODE_ENV "${rawNodeEnv}" is not recognised — must be development or production.`);
    }
  }

  // SESSION_SECRET — optional but warn; generate 64-char hex fallback
  let sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    sessionSecret = crypto.randomBytes(32).toString("hex");
    console.warn("[Config] ⚠️  SESSION_SECRET not set — using a random secret. Sessions will be invalidated on restart.");
    console.warn("[Config]    Set SESSION_SECRET in Replit Secrets for persistent sessions.");
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
      console.warn(`[Config] LOG_LEVEL "${rawLogLevel}" is invalid — must be debug|info|warn|error. Defaulting to info.`);
    }
  }

  _config = {
    databaseUrl: databaseUrl!,
    vapidPublicKey,
    vapidPrivateKey,
    port,
    nodeEnv,
    sessionSecret,
    allowedOrigin,
    logLevel,
  };

  console.log(`[Config] Environment validated. port=${port} nodeEnv=${nodeEnv ?? "unset"} logLevel=${logLevel}`);
  return _config;
}

export function getConfig(): AppConfig {
  if (!_config) throw new Error("validateEnvironment() must be called before getConfig()");
  return _config;
}
