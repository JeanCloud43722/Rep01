import express, { type Request, Response, NextFunction } from "express";
import { validateEnvironment } from "./env-validation";
import { registerRoutes } from "./routes";
import { runMigrations, closeDb } from "./db";
import { serveStatic } from "./static";
import { createServer } from "http";
import { logger } from "./lib/logger";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    if (path.startsWith("/api")) {
      const durationMs = Date.now() - start;
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      logger[level]("API request", {
        method: req.method,
        path,
        status: res.statusCode,
        durationMs,
        ip: req.ip ?? req.socket.remoteAddress,
      });
    }
  });

  next();
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

(async () => {
  const config = validateEnvironment();

  try {
    await runMigrations();
  } catch (err) {
    logger.error("Migration failed — cannot start server", {
      source: "db",
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    logger.error("Unhandled Express error", { status, message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (config.nodeEnv === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = config.port;
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      logger.info("Server listening", { source: "express", port });
    },
  );

  const shutdown = async () => {
    logger.info("Shutting down…", { source: "express" });
    await closeDb();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
})();
