import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  assertValidTransition,
  canReactivate,
  ValidationError,
} from "../lib/state-machine";
import type { Order } from "@shared/schema";

describe("isValidTransition", () => {
  it("waiting → subscribed is valid", () => {
    expect(isValidTransition("waiting", "subscribed")).toBe(true);
  });

  it("waiting → notified is valid (direct notify)", () => {
    expect(isValidTransition("waiting", "notified")).toBe(true);
  });

  it("waiting → scheduled is valid (schedule before subscribe)", () => {
    expect(isValidTransition("waiting", "scheduled")).toBe(true);
  });

  it("subscribed → scheduled is valid", () => {
    expect(isValidTransition("subscribed", "scheduled")).toBe(true);
  });

  it("subscribed → notified is valid", () => {
    expect(isValidTransition("subscribed", "notified")).toBe(true);
  });

  it("scheduled → notified is valid", () => {
    expect(isValidTransition("scheduled", "notified")).toBe(true);
  });

  it("notified → completed is valid", () => {
    expect(isValidTransition("notified", "completed")).toBe(true);
  });

  it("waiting → completed is invalid", () => {
    expect(isValidTransition("waiting", "completed")).toBe(false);
  });

  it("notified → subscribed is invalid", () => {
    expect(isValidTransition("notified", "subscribed")).toBe(false);
  });

  it("completed → notified is invalid (must reactivate first)", () => {
    expect(isValidTransition("completed", "notified")).toBe(false);
  });

  it("completed → waiting is valid (reactivation path)", () => {
    expect(isValidTransition("completed", "waiting")).toBe(true);
  });

  it("completed → subscribed is valid (reactivation path)", () => {
    expect(isValidTransition("completed", "subscribed")).toBe(true);
  });
});

describe("assertValidTransition", () => {
  it("throws ValidationError on invalid transition", () => {
    expect(() => assertValidTransition("waiting", "completed")).toThrow(
      ValidationError
    );
  });

  it("throws with descriptive message including allowed transitions", () => {
    expect(() => assertValidTransition("waiting", "completed")).toThrow(
      /Allowed:/
    );
  });

  it("does not throw on valid transition", () => {
    expect(() => assertValidTransition("waiting", "subscribed")).not.toThrow();
  });

  it("does not throw: subscribed → notified (direct notify)", () => {
    expect(() => assertValidTransition("subscribed", "notified")).not.toThrow();
  });

  it("does not throw: completed → waiting (reactivation)", () => {
    expect(() => assertValidTransition("completed", "waiting")).not.toThrow();
  });

  it("ValidationError has status 400", () => {
    try {
      assertValidTransition("notified", "subscribed");
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).status).toBe(400);
    }
  });
});

describe("canReactivate", () => {
  const makeOrder = (status: Order["status"]): Order => ({
    id: "TST001",
    createdAt: new Date().toISOString(),
    status,
    subscription: null,
    scheduledTime: null,
    notifiedAt: null,
    messages: [],
    offers: [],
    serviceRequests: [],
    notes: "",
    reactivationCount: 0,
    lastReactivatedAt: null,
  });

  it("returns true for completed orders", () => {
    expect(canReactivate(makeOrder("completed"))).toBe(true);
  });

  it("returns false for waiting orders", () => {
    expect(canReactivate(makeOrder("waiting"))).toBe(false);
  });

  it("returns false for subscribed orders", () => {
    expect(canReactivate(makeOrder("subscribed"))).toBe(false);
  });

  it("returns false for scheduled orders", () => {
    expect(canReactivate(makeOrder("scheduled"))).toBe(false);
  });

  it("returns false for notified orders", () => {
    expect(canReactivate(makeOrder("notified"))).toBe(false);
  });
});
