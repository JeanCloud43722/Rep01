import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  assertValidTransition,
  ValidationError,
} from "../lib/state-machine";

describe("isValidTransition", () => {
  it("waiting → subscribed is valid", () => {
    expect(isValidTransition("waiting", "subscribed")).toBe(true);
  });

  it("waiting → notified is valid (direct notify)", () => {
    expect(isValidTransition("waiting", "notified")).toBe(true);
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

  it("completed → notified is invalid (terminal state)", () => {
    expect(isValidTransition("completed", "notified")).toBe(false);
  });

  it("completed → waiting is invalid (terminal state)", () => {
    expect(isValidTransition("completed", "waiting")).toBe(false);
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
