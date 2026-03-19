import { beforeEach } from "vitest";
import { storage } from "./storage";

// Note: DbStorage uses a real database backend, so we don't need to reset
// in-memory state. Test cleanup is handled by individual test suites via
// cleanupOrderData, cleanupTestProducts, etc.
beforeEach(() => {
  // DbStorage does not have a reset() method. DB isolation is managed
  // by explicit cleanup in test suites.
});
