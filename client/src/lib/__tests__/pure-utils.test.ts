import { describe, it, expect } from "vitest";
import { formatKitchenTicket, type TicketOrder, type TicketItem } from "../ticket-formatter";
import { formatCartToChatMessage, type CartLineItem } from "../cart-formatter";
import { isConfirmationPending } from "../chat-state-utils";
import { buildOrderMessage } from "../../components/ProductCatalog/types";

// ─── formatKitchenTicket ───────────────────────────────────────────────────────

describe("formatKitchenTicket", () => {
  const baseOrder: TicketOrder = { id: "ABC123", createdAt: "2025-01-15T12:30:00Z" };
  const baseItems: TicketItem[] = [
    { name: "Margherita Pizza", quantity: 2, price: 12.5, variantName: null },
    { name: "Cola", quantity: 1, price: 3.5 },
  ];

  it("produces output where every line is exactly 32 characters", () => {
    const ticket = formatKitchenTicket(baseOrder, baseItems);
    const lines = ticket.split("\n");
    lines.forEach((line, idx) => {
      expect(line.length, `Line ${idx} has wrong length: "${line}"`).toBe(32);
    });
  });

  it("includes BISTRO BUZZER header centred", () => {
    const ticket = formatKitchenTicket(baseOrder, baseItems);
    expect(ticket).toContain("BISTRO BUZZER");
  });

  it("includes Kitchen Ticket subtitle", () => {
    const ticket = formatKitchenTicket(baseOrder, baseItems);
    expect(ticket).toContain("Kitchen Ticket");
  });

  it("includes the order ID", () => {
    const ticket = formatKitchenTicket(baseOrder, baseItems);
    expect(ticket).toContain("ABC123");
  });

  it("includes a Time: line", () => {
    const ticket = formatKitchenTicket(baseOrder, baseItems);
    expect(ticket).toMatch(/Time:/);
  });

  it("includes a 32-dash separator", () => {
    const ticket = formatKitchenTicket(baseOrder, baseItems);
    expect(ticket).toContain("--------------------------------");
  });

  it("calculates total correctly", () => {
    const ticket = formatKitchenTicket(baseOrder, baseItems);
    // 2 × 12.50 + 1 × 3.50 = 28.50
    expect(ticket).toContain("28.50");
  });

  it("includes TOTAL label", () => {
    const ticket = formatKitchenTicket(baseOrder, baseItems);
    expect(ticket).toContain("TOTAL:");
  });

  it("includes Thank you! footer", () => {
    const ticket = formatKitchenTicket(baseOrder, baseItems);
    expect(ticket).toContain("Thank you!");
  });

  it("renders quantity and product name on item line", () => {
    const ticket = formatKitchenTicket(baseOrder, baseItems);
    expect(ticket).toMatch(/2x Margherita Pizza/);
    expect(ticket).toMatch(/1x Cola/);
  });

  it("includes variant name in parentheses when provided", () => {
    const items: TicketItem[] = [
      { name: "Steak", quantity: 1, price: 24.0, variantName: "Medium Rare" },
    ];
    const ticket = formatKitchenTicket(baseOrder, items);
    expect(ticket).toMatch(/Medium Rare/);
  });

  it("wraps long modifications text", () => {
    const items: TicketItem[] = [
      {
        name: "Burger",
        quantity: 1,
        price: 15.0,
        modifications: "no onions no pickles extra cheese",
      },
    ];
    const ticket = formatKitchenTicket(baseOrder, items);
    expect(ticket).toMatch(/no onions/);
  });

  it("handles single item with no variant", () => {
    const items: TicketItem[] = [{ name: "Soup", quantity: 1, price: 7.0 }];
    const ticket = formatKitchenTicket(baseOrder, items);
    const lines = ticket.split("\n");
    lines.forEach((line, idx) => {
      expect(line.length, `Line ${idx} has wrong length`).toBe(32);
    });
    expect(ticket).toContain("7.00");
  });

  it("strips non-ASCII characters from modifications text", () => {
    const items: TicketItem[] = [
      { name: "Burger", quantity: 1, price: 15.0, modifications: "kein Käse bitte" },
    ];
    const ticket = formatKitchenTicket(baseOrder, items);
    // Non-ASCII in modifications (ä) is stripped; ASCII parts remain
    expect(ticket).toContain("kein");
    expect(ticket).toContain("bitte");
    // The escaped version should not appear as ä character
    const lines = ticket.split("\n");
    const modLine = lines.find((l) => l.includes("kein"));
    if (modLine) {
      // eslint-disable-next-line no-control-regex
      expect(modLine).not.toMatch(/[^\x00-\x7F]/);
    }
  });

  it("truncates very long item names with ellipsis marker", () => {
    const items: TicketItem[] = [
      {
        name: "A Very Long Restaurant Item Name That Exceeds The Column Width",
        quantity: 1,
        price: 10.0,
      },
    ];
    const ticket = formatKitchenTicket(baseOrder, items);
    expect(ticket).toContain("...");
    const lines = ticket.split("\n");
    lines.forEach((line, idx) => {
      expect(line.length, `Line ${idx} has wrong length`).toBe(32);
    });
  });
});

// ─── formatCartToChatMessage ───────────────────────────────────────────────────

describe("formatCartToChatMessage", () => {
  it("returns empty string for empty cart", () => {
    expect(formatCartToChatMessage([])).toBe("");
  });

  it("includes product name and quantity", () => {
    const cart: CartLineItem[] = [
      { productName: "Margherita", quantity: 2, unitPrice: 12.0 },
    ];
    const msg = formatCartToChatMessage(cart);
    expect(msg).toContain("2x Margherita");
  });

  it("includes variant name in parentheses", () => {
    const cart: CartLineItem[] = [
      {
        productName: "Steak",
        quantity: 1,
        unitPrice: 24.0,
        selectedVariant: { name: "Medium Rare", price: 24.0 },
      },
    ];
    const msg = formatCartToChatMessage(cart);
    expect(msg).toContain("(Medium Rare)");
  });

  it("includes modifications after a dash", () => {
    const cart: CartLineItem[] = [
      { productName: "Pasta", quantity: 1, unitPrice: 14.0, modifications: "no cream" },
    ];
    const msg = formatCartToChatMessage(cart);
    expect(msg).toContain("no cream");
  });

  it("calculates total correctly for multiple items", () => {
    const cart: CartLineItem[] = [
      { productName: "Pizza", quantity: 2, unitPrice: 12.0 },
      { productName: "Drink", quantity: 1, unitPrice: 3.5 },
    ];
    const msg = formatCartToChatMessage(cart);
    // 2 × 12 + 1 × 3.5 = 27.50
    expect(msg).toContain("27.50");
  });

  it("starts with the ordering intent phrase", () => {
    const cart: CartLineItem[] = [
      { productName: "Salad", quantity: 1, unitPrice: 8.0 },
    ];
    const msg = formatCartToChatMessage(cart);
    expect(msg).toMatch(/^I'd like to order:/);
  });

  it("uses euro symbol in total", () => {
    const cart: CartLineItem[] = [
      { productName: "Salad", quantity: 1, unitPrice: 8.0 },
    ];
    const msg = formatCartToChatMessage(cart);
    expect(msg).toContain("\u20ac");
  });
});

// ─── isConfirmationPending ─────────────────────────────────────────────────────

describe("isConfirmationPending", () => {
  it("returns false for null", () => {
    expect(isConfirmationPending(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isConfirmationPending(undefined)).toBe(false);
  });

  it("returns true for a non-null object", () => {
    expect(isConfirmationPending({ intent: "order", items: [] })).toBe(true);
  });

  it("returns true for a non-null string", () => {
    expect(isConfirmationPending("pending")).toBe(true);
  });

  it("returns true for the number 0 (falsy but not null/undefined)", () => {
    expect(isConfirmationPending(0)).toBe(true);
  });

  it("returns true for an empty object", () => {
    expect(isConfirmationPending({})).toBe(true);
  });
});

// ─── buildOrderMessage (existing ProductCatalog helper) ───────────────────────

describe("buildOrderMessage", () => {
  it("formats a single-item cart into a readable order message", () => {
    const cart = [
      {
        productId: 1,
        productName: "Margherita",
        quantity: 1,
        unitPrice: 12.0,
        modifications: "",
      },
    ];
    const msg = buildOrderMessage(cart);
    expect(msg).toContain("Margherita");
    expect(msg).toContain("12.00");
    expect(msg).toMatch(/I'd like to order:/);
  });

  it("includes variant name when selectedVariant is set", () => {
    const cart = [
      {
        productId: 2,
        productName: "Steak",
        quantity: 1,
        unitPrice: 24.0,
        selectedVariant: { name: "Well Done", price: 24.0 },
        modifications: "",
      },
    ];
    const msg = buildOrderMessage(cart);
    expect(msg).toContain("Well Done");
  });

  it("sums totals across multiple items", () => {
    const cart = [
      { productId: 1, productName: "Pizza", quantity: 2, unitPrice: 12.0, modifications: "" },
      { productId: 2, productName: "Juice", quantity: 1, unitPrice: 4.0, modifications: "" },
    ];
    const msg = buildOrderMessage(cart);
    // 2 × 12 + 1 × 4 = 28
    expect(msg).toContain("28.00");
  });

  it("includes modifications when present", () => {
    const cart = [
      {
        productId: 1,
        productName: "Burger",
        quantity: 1,
        unitPrice: 15.0,
        modifications: "extra cheese",
      },
    ];
    const msg = buildOrderMessage(cart);
    expect(msg).toContain("extra cheese");
  });
});
