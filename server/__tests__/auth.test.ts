import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import {
  createTestApp,
  closeTestServer,
} from "../test-helper";
import type { Server } from "http";
import type express from "express";

let app: express.Express;
let server: Server;

beforeAll(async () => {
  ({ app, server } = await createTestApp());
});

afterAll(async () => {
  await closeTestServer(server);
});

describe("POST /api/auth/login", () => {
  it("returns 200 and sets session with correct credentials", async () => {
    const agent = request.agent(app);
    const res = await agent
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.username).toBe("admin");

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.username).toBe("admin");
  });

  it("returns 401 with wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "wrongpassword" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when credentials are missing", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
  });
});

describe("Protected routes without session", () => {
  it("GET /api/orders returns 401 without session (admin route)", async () => {
    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(401);
  });
});

describe("Public routes without session", () => {
  it("GET /api/orders/:id returns 404 (not 401) for unknown id — customer route is public", async () => {
    const res = await request(app).get("/api/orders/PUBLICORDER");
    expect(res.status).toBe(404);
  });

  it("GET /api/orders/:id returns 200 for a real order without session", async () => {
    const loginAgent = request.agent(app);
    await loginAgent
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });
    const created = await loginAgent.post("/api/orders");
    const orderId = created.body.id;

    const res = await request(app).get(`/api/orders/${orderId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orderId);
  });
});
