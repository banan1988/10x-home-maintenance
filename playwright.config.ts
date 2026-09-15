import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  // The default 30s per-test budget is tuned for a production build; Astro's dev server
  // transforms each route on first request, and shared CI runners are slower than a local
  // machine, so a multi-page journey test (login -> dashboard -> tasks -> edit -> delete)
  // can legitimately need more time in CI even though it stays well under a second per step
  // once each route is warm.
  timeout: process.env.CI ? 90_000 : 30_000,
  use: {
    baseURL: "http://localhost:4321",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4321",
    // Always true (not just locally): in CI the workflow starts and warms up the dev
    // server itself before running tests (see .github/workflows/ci.yml) to dodge a
    // first-request Vite SSR dependency pre-bundling reload race against a cold
    // node_modules cache. reuseExistingServer still starts its own server when none
    // is already running, so local runs are unaffected.
    reuseExistingServer: true,
    timeout: 120_000,
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
