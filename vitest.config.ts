import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["server/**/*.test.ts", "client/src/lib/__tests__/**/*.test.ts"],
    setupFiles: ["./server/test-setup.ts"],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@shared": path.resolve("./shared"),
    },
  },
});
