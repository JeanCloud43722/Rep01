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

async function createOrder() {
  const res = await agent.post("/api/orders");
  return res.body.id as string;
}

describe("POST /api/orders/:id/message (staff)", () => {
  it("adds a staff message to an order", async () => {
    const orderId = await createOrder();
    const res = await agent
      .post(`/api/orders/${orderId}/message`)
      .send({ message: "Your order is almost ready" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const order = await request(app).get(`/api/orders/${orderId}`);
    expect(order.body.messages).toHaveLength(1);
    expect(order.body.messages[0].sender).toBe("staff");
    expect(order.body.messages[0].text).toBe("Your order is almost ready");
  });

  it("returns 401 without authentication", async () => {
    const orderId = await createOrder();
    const res = await request(app)
      .post(`/api/orders/${orderId}/message`)
      .send({ message: "Hello" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for an empty message", async () => {
    const orderId = await createOrder();
    const res = await agent
      .post(`/api/orders/${orderId}/message`)
      .send({ message: "" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a message exceeding 200 characters", async () => {
    const orderId = await createOrder();
    const res = await agent
      .post(`/api/orders/${orderId}/message`)
      .send({ message: "x".repeat(201) });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a non-existent order", async () => {
    const res = await agent
      .post("/api/orders/NONEXISTENT/message")
      .send({ message: "Hello" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/orders/:id/customer-message", () => {
  it("adds a customer message to an order", async () => {
    const orderId = await createOrder();
    const res = await request(app)
      .post(`/api/orders/${orderId}/customer-message`)
      .send({ message: "I need extra napkins" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const order = await request(app).get(`/api/orders/${orderId}`);
    expect(order.body.messages).toHaveLength(1);
    expect(order.body.messages[0].sender).toBe("customer");
    expect(order.body.messages[0].text).toBe("I need extra napkins");
  });

  it("returns 400 for an empty message", async () => {
    const orderId = await createOrder();
    const res = await request(app)
      .post(`/api/orders/${orderId}/customer-message`)
      .send({ message: "" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a message exceeding 200 characters", async () => {
    const orderId = await createOrder();
    const res = await request(app)
      .post(`/api/orders/${orderId}/customer-message`)
      .send({ message: "y".repeat(201) });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a non-existent order", async () => {
    const res = await request(app)
      .post("/api/orders/NONEXISTENT/customer-message")
      .send({ message: "Hello" });
    expect(res.status).toBe(404);
  });
});
