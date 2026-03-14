import winston from "winston";

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const VALID_LEVELS = ["debug", "info", "warn", "error"] as const;
type LogLevel = typeof VALID_LEVELS[number];

function resolveLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL;
  if (raw && VALID_LEVELS.includes(raw as LogLevel)) return raw as LogLevel;
  return "info";
}

const isDev = process.env.NODE_ENV !== "production";

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
    return stack
      ? `${timestamp} ${level}: ${message}\n${stack}${metaStr}`
      : `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

export const logger = winston.createLogger({
  level: resolveLevel(),
  format: isDev ? devFormat : prodFormat,
  transports: [new winston.transports.Console()],
});

const SENSITIVE_FRAGMENTS = ["password", "token", "auth", "p256dh", "secret"];

export function sanitize(
  obj: Record<string, unknown>,
  fields: string[] = SENSITIVE_FRAGMENTS
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    result[key] = fields.some((f) => lower.includes(f)) ? "[REDACTED]" : value;
  }
  return result;
}
