import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import type { Server } from "http";
import type express from "express";
import { createTestApp, createLoggedInAgent, closeTestServer } from "../test-helper";
import {
  insertTestProduct,
  cleanupTestProducts,
  cleanupOrderData,
  VITEST_PRODUCT_PREFIX,
} from "./setup";

let app: express.Express;
let server: Server;
let adminAgent: ReturnType<typeof request.agent>;
let testProductId: number;
const insertedProductIds: number[] = [];

// Helper: create a valid UUID v4 for idempotency key tests
function makeUUID(): string {
  return randomUUID();
}

// Build the JSON block DeepSeek would return for a pizza order
function makeMockOrderContent(productId: number, quantity: number): string {
  const json = {
    intent: "order",
    items: [
      {
        product_id: productId,
        product_name: `${VITEST_PRODUCT_PREFIX}Active Pizza`,
        quantity,
        unit_price: 12.5,
      },
    ],
    requires_clarification: false,
  };
  return `Here is your order summary:\n\`\`\`json\n${JSON.stringify(json)}\n\`\`\``;
}

beforeAll(async () => {
  ({ app, server } = await createTestApp());
  adminAgent = await createLoggedInAgent(app);

  testProductId = await insertTestProduct({
    name: `${VITEST_PRODUCT_PREFIX}Active Pizza`,
    category: "pizza",
    price: "12.50",
    isActive: true,
    tags: [],
  });
  insertedProductIds.push(testProductId);
});

afterAll(async () => {
  await cleanupTestProducts(insertedProductIds);
  await closeTestServer(server);
});

// ─── Chat endpoint ─────────────────────────────────────────────────────────────

describe("POST /api/orders/:id/chat — validation", () => {
  it("returns 400 when message is missing", async () => {
    const order = await adminAgent.post("/api/orders");
    const orderId = order.body.id as string;

    const res = await request(app)
      .post(`/api/orders/${orderId}/chat`)
      .send({ history: [] });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("INVALID_INPUT");
  });

  it("returns 400 when message exceeds 2000 chars", async () => {
    const order = await adminAgent.post("/api/orders");
    const orderId = order.body.id as string;

    const res = await request(app)
      .post(`/api/orders/${orderId}/chat`)
      .send({ message: "x".repeat(2001) });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("INVALID_INPUT");
  });
});

describe("POST /api/orders/:id/chat — AI response", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            { message: { content: makeMockOrderContent(testProductId, 2) } },
          ],
        }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns reply and order_preview for a valid food-only order", async () => {
    const order = await adminAgent.post("/api/orders");
    const orderId = order.body.id as string;

    const res = await request(app)
      .post(`/api/orders/${orderId}/chat`)
      .send({ message: "I'd like 2 margherita pizzas please", history: [] });

    expect(res.status).toBe(200);
    expect(typeof res.body.reply).toBe("string");
    expect(res.body.reply.length).toBeGreaterThan(0);
    expect(res.body.order_preview).toBeDefined();
    expect(res.body.order_preview.intent).toBe("order");
    expect(res.body.order_preview.items).toHaveLength(1);
    expect(res.body.order_preview.items[0].product_id).toBe(testProductId);
    expect(res.body.order_preview.items[0].quantity).toBe(2);
    expect(res.body.meta?.has_order_json).toBe(true);
  });

  it("appends drink upsell suggestion when order is food-only", async () => {
    const order = await adminAgent.post("/api/orders");
    const orderId = order.body.id as string;

    const res = await request(app)
      .post(`/api/orders/${orderId}/chat`)
      .send({ message: "2 margheritas please", history: [] });

    expect(res.status).toBe(200);
    expect(res.body.reply).toContain("drink");
  });
});

// ─── Confirm-order endpoint ────────────────────────────────────────────────────

describe("POST /api/orders/:id/confirm-order — validation", () => {
  it("returns 400 for missing idempotency key", async () => {
    const order = await adminAgent.post("/api/orders");
    const orderId = order.body.id as string;

    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm-order`)
      .send({ items: [{ product_id: testProductId, quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("INVALID_IDEMPOTENCY_KEY");
  });

  it("returns 400 for invalid idempotency key format", async () => {
    const order = await adminAgent.post("/api/orders");
    const orderId = order.body.id as string;

    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm-order`)
      .send({ idempotencyKey: "not-a-uuid", items: [{ product_id: testProductId, quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("INVALID_IDEMPOTENCY_KEY");
  });

  it("returns 400 when items array is empty", async () => {
    const order = await adminAgent.post("/api/orders");
    const orderId = order.body.id as string;

    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm-order`)
      .send({ idempotencyKey: makeUUID(), items: [] });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("INVALID_ITEMS");
  });

  it("returns 404 when order does not exist", async () => {
    const res = await request(app)
      .post("/api/orders/NONEXISTENT/confirm-order")
      .send({
        idempotencyKey: makeUUID(),
        items: [{ product_id: testProductId, quantity: 1 }],
      });

    expect(res.status).toBe(404);
  });
});

describe("POST /api/orders/:id/confirm-order — happy path", () => {
  it("inserts order items and returns success with persisted records", async () => {
    const order = await adminAgent.post("/api/orders");
    const orderId = order.body.id as string;
    const iKey = makeUUID();

    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm-order`)
      .send({
        idempotencyKey: iKey,
        items: [{ product_id: testProductId, quantity: 2 }],
      });

    try {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.order_items)).toBe(true);
      expect(res.body.order_items).toHaveLength(1);
      expect(res.body.order_items[0].quantity).toBe(2);
      expect(res.body.order_items[0].priceAtTime).toBe("12.50");
      expect(res.body.order_items[0].productId).toBe(testProductId);
    } finally {
      await cleanupOrderData(orderId);
    }
  });

  it("server resolves price from DB, ignores client-supplied unit_price", async () => {
    const order = await adminAgent.post("/api/orders");
    const orderId = order.body.id as string;
    const iKey = makeUUID();

    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm-order`)
      .send({
        idempotencyKey: iKey,
        items: [{ product_id: testProductId, quantity: 1, unit_price: 999.99 }],
      });

    try {
      expect(res.status).toBe(200);
      // Server uses DB price (12.50), not the client-supplied 999.99
      expect(res.body.order_items[0].priceAtTime).toBe("12.50");
    } finally {
      await cleanupOrderData(orderId);
    }
  });

  it("rejects duplicate idempotency key within 10 minutes", async () => {
    const order = await adminAgent.post("/api/orders");
    const orderId = order.body.id as string;
    const iKey = makeUUID();

    const payload = {
      idempotencyKey: iKey,
      items: [{ product_id: testProductId, quantity: 1 }],
    };

    const first = await request(app)
      .post(`/api/orders/${orderId}/confirm-order`)
      .send(payload);
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);

    try {
      const second = await request(app)
        .post(`/api/orders/${orderId}/confirm-order`)
        .send(payload);
      expect(second.status).toBe(200);
      expect(second.body.duplicate).toBe(true);
    } finally {
      await cleanupOrderData(orderId);
    }
  });
});

// ─── GET order-items ───────────────────────────────────────────────────────────

describe("GET /api/orders/:id/order-items", () => {
  it("returns empty array for order with no items", async () => {
    const order = await adminAgent.post("/api/orders");
    const orderId = order.body.id as string;

    const res = await request(app).get(`/api/orders/${orderId}/order-items`);
    expect(res.status).toBe(200);
    expect(res.body.order_items).toEqual([]);
  });

  it("returns confirmed items with product name after confirmation", async () => {
    const order = await adminAgent.post("/api/orders");
    const orderId = order.body.id as string;
    const iKey = makeUUID();

    await request(app)
      .post(`/api/orders/${orderId}/confirm-order`)
      .send({ idempotencyKey: iKey, items: [{ product_id: testProductId, quantity: 3 }] });

    const res = await request(app).get(`/api/orders/${orderId}/order-items`);

    try {
      expect(res.status).toBe(200);
      expect(res.body.order_items).toHaveLength(1);
      expect(res.body.order_items[0].productName).toBe(`${VITEST_PRODUCT_PREFIX}Active Pizza`);
      expect(res.body.order_items[0].quantity).toBe(3);
    } finally {
      await cleanupOrderData(orderId);
    }
  });
});
