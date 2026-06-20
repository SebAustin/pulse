import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests run against DynamoDB Local (docker compose).
// Start it first: `npm run ddb:up && npm run ddb:init`.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/integration/**/*.test.ts"],
    // Integration tests share a table; run serially to keep assertions deterministic.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
