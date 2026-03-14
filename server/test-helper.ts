import express from "express";
import { createServer } from "http";
import session from "express-session";
import MemoryStore from "memorystore";
import request from "supertest";
import { registerRoutes } from "./routes";
import { validateEnvironment } from "./env-validation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MemStore = (MemoryStore as any)(session);

export async function createTestApp() {
  validateEnvironment();

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  const sessionMiddleware = session({
    secret: "test-secret-vitest",
    resave: false,
    saveUninitialized: false,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    store: new MemStore({ checkPeriod: 86400000 }) as session.Store,
    cookie: { secure: false },
  });

  app.use(sessionMiddleware);

  const server = createServer(app);
  await registerRoutes(server, app, sessionMiddleware);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  return { app, server };
}

export async function createLoggedInAgent(app: express.Express) {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/login")
    .send({ username: "admin", password: "admin123" });
  if (res.status !== 200) {
    throw new Error(`Login failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return agent;
}

export async function closeTestServer(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}
