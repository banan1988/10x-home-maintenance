import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
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
