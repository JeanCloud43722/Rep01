import { beforeEach } from "vitest";
import { storage } from "./storage";

beforeEach(() => {
  (storage as unknown as { reset(): void }).reset();
});
