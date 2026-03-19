import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Server } from "http";
import type express from "express";
import { createTestApp, closeTestServer } from "../test-helper";
import {
  insertTestProduct,
  cleanupTestProducts,
  VITEST_PRODUCT_PREFIX,
} from "./setup";

let app: express.Express;
let server: Server;
const insertedProductIds: number[] = [];

beforeAll(async () => {
  ({ app, server } = await createTestApp());

  // Insert deterministic test products for these tests
  const activeId = await insertTestProduct({
    name: `${VITEST_PRODUCT_PREFIX}Active Pizza`,
    category: "pizza",
    price: "12.50",
    isActive: true,
    tags: ["popular", "vegetarian"],
  });
  const inactiveId = await insertTestProduct({
    name: `${VITEST_PRODUCT_PREFIX}Inactive Soup`,
    category: "soups",
    price: "7.00",
    isActive: false,
  });
  const secondActiveId = await insertTestProduct({
    name: `${VITEST_PRODUCT_PREFIX}Active Pasta`,
    category: "pasta",
    price: "14.00",
    isActive: true,
    tags: ["vegetarian"],
  });

  insertedProductIds.push(activeId, inactiveId, secondActiveId);
});

afterAll(async () => {
  await cleanupTestProducts(insertedProductIds);
  await closeTestServer(server);
});

describe("GET /api/products — base behaviour", () => {
  it("returns 200 with products array and meta", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.total).toBe("number");
  });

  it("excludes inactive products by default", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    const names: string[] = res.body.products.map((p: { name: string }) => p.name);
    expect(names).not.toContain(`${VITEST_PRODUCT_PREFIX}Inactive Soup`);
    expect(names).toContain(`${VITEST_PRODUCT_PREFIX}Active Pizza`);
    expect(names).toContain(`${VITEST_PRODUCT_PREFIX}Active Pasta`);
  });

  it("includes isActive field in returned products", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    const testProducts = res.body.products.filter((p: { name: string }) =>
      p.name.startsWith(VITEST_PRODUCT_PREFIX)
    );
    testProducts.forEach((p: { isActive: boolean }) => {
      expect(p.isActive).toBe(true);
    });
  });
});

describe("GET /api/products — category filter", () => {
  it("filters by category (case-insensitive normalised)", async () => {
    const res = await request(app).get("/api/products?category=pizza");
    expect(res.status).toBe(200);
    const names: string[] = res.body.products.map((p: { name: string }) => p.name);
    expect(names).toContain(`${VITEST_PRODUCT_PREFIX}Active Pizza`);
    expect(names).not.toContain(`${VITEST_PRODUCT_PREFIX}Active Pasta`);
  });

  it("returns empty array for non-existent category", async () => {
    const res = await request(app).get("/api/products?category=zzz_nonexistent_vitest");
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(0);
  });
});

describe("GET /api/products — search filter", () => {
  it("returns matching products for a search term", async () => {
    const res = await request(app).get(
      `/api/products?search=${encodeURIComponent("Active Pizza")}`
    );
    expect(res.status).toBe(200);
    const names: string[] = res.body.products.map((p: { name: string }) => p.name);
    expect(names).toContain(`${VITEST_PRODUCT_PREFIX}Active Pizza`);
    expect(names).not.toContain(`${VITEST_PRODUCT_PREFIX}Active Pasta`);
  });

  it("is case-insensitive", async () => {
    const res = await request(app).get(
      `/api/products?search=${encodeURIComponent("active pizza")}`
    );
    expect(res.status).toBe(200);
    const names: string[] = res.body.products.map((p: { name: string }) => p.name);
    expect(names).toContain(`${VITEST_PRODUCT_PREFIX}Active Pizza`);
  });
});

describe("GET /api/products — ETag / 304 caching", () => {
  it("sets an ETag header on successful response", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.headers["etag"]).toBeDefined();
    expect(typeof res.headers["etag"]).toBe("string");
  });

  it("returns 304 when If-None-Match matches ETag", async () => {
    const first = await request(app).get("/api/products");
    const etag = first.headers["etag"] as string;
    expect(etag).toBeTruthy();

    const second = await request(app)
      .get("/api/products")
      .set("If-None-Match", etag);
    expect(second.status).toBe(304);
  });

  it("sets Cache-Control header", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toContain("s-maxage=60");
    expect(res.headers["cache-control"]).toContain("stale-while-revalidate=30");
  });
});
