import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3002",
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10000,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
