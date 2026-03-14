import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import {
  createTestApp,
  createLoggedInAgent,
  closeTestServer,
} from "../test-helper";
import type { Server } from "http";
import type express from "express";

let app: express.Express;
let server: Server;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  ({ app, server } = await createTestApp());
  agent = await createLoggedInAgent(app);
});

afterAll(async () => {
  await closeTestServer(server);
});

describe("POST /api/orders", () => {
  it("creates an order with 'waiting' status and returns 201", async () => {
    const res = await agent.post("/api/orders");
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("waiting");
    expect(typeof res.body.id).toBe("string");
    expect(res.body.serviceRequests).toEqual([]);
    expect(res.body.messages).toEqual([]);
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app).post("/api/orders");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/orders/:id", () => {
  it("returns the order by ID", async () => {
    const created = await agent.post("/api/orders");
    const orderId = created.body.id;

    const res = await request(app).get(`/api/orders/${orderId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orderId);
  });

  it("returns 404 for a non-existent order", async () => {
    const res = await request(app).get("/api/orders/NONEXISTENT");
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/orders/:id", () => {
  it("deletes an existing order and returns 204", async () => {
    const created = await agent.post("/api/orders");
    const orderId = created.body.id;

    const res = await agent.delete(`/api/orders/${orderId}`);
    expect(res.status).toBe(204);

    const get = await request(app).get(`/api/orders/${orderId}`);
    expect(get.status).toBe(404);
  });

  it("returns 404 when deleting a non-existent order", async () => {
    const res = await agent.delete("/api/orders/NONEXISTENT");
    expect(res.status).toBe(404);
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app).delete("/api/orders/ANYID");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/orders/:id/register", () => {
  it("transitions a waiting order to subscribed", async () => {
    const created = await agent.post("/api/orders");
    const orderId = created.body.id;
    expect(created.body.status).toBe("waiting");

    const res = await request(app).post(`/api/orders/${orderId}/register`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("subscribed");
  });

  it("is idempotent on a non-waiting order (no error)", async () => {
    const created = await agent.post("/api/orders");
    const orderId = created.body.id;

    await request(app).post(`/api/orders/${orderId}/register`);
    const res = await request(app).post(`/api/orders/${orderId}/register`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("subscribed");
  });

  it("returns 404 for a non-existent order", async () => {
    const res = await request(app).post("/api/orders/NONEXISTENT/register");
    expect(res.status).toBe(404);
  });
});
