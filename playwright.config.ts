import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for Pulse.
 *
 * - Chromium only (per spec).
 * - webServer block boots Next.js dev with DynamoDB Local env vars; expects
 *   DynamoDB Local to already be running on port 8000 (start with `npm run ddb:up`).
 * - In CI the workflow starts DDB Local as a service container before running this.
 * - Trace collected on first retry; screenshots + video captured on failure.
 * - Tests live under test/e2e/.
 */
export default defineConfig({
  testDir: "./test/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Boots the dev server if not already running.
  // In CI the workflow starts the server separately so we skip the webServer block
  // by setting the PLAYWRIGHT_USE_EXISTING_SERVER env var.
  webServer: process.env.PLAYWRIGHT_USE_EXISTING_SERVER
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          PULSE_DB_MODE: "local",
          PULSE_TABLE_NAME: "Pulse",
          DYNAMODB_LOCAL_ENDPOINT: "http://localhost:8000",
          AWS_REGION: "us-east-1",
          SSE_INTERVAL_MS: "1000",
          SSE_CACHE_TTL_MS: "500",
        },
      },
});
