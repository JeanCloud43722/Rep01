/**
 * Server-side order status state machine.
 * Enforces valid transitions and prevents data corruption from API misuse.
 */

export type OrderStatus = "waiting" | "subscribed" | "scheduled" | "notified" | "completed";

export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  waiting:   ["subscribed", "notified"],
  subscribed: ["scheduled", "notified"],
  scheduled: ["notified"],
  notified:  ["completed"],
  completed: [],
};

export function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from as OrderStatus];
  if (!allowed) return false;
  return allowed.includes(to as OrderStatus);
}

export class ValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function assertValidTransition(from: string, to: string): void {
  if (!isValidTransition(from, to)) {
    const allowed = VALID_TRANSITIONS[from as OrderStatus];
    const allowedList = allowed && allowed.length > 0
      ? allowed.join(", ")
      : "none (terminal state)";
    throw new ValidationError(
      `Invalid status transition from '${from}' to '${to}'. Allowed: ${allowedList}`
    );
  }
}
