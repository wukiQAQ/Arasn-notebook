import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 45000,
  use: { viewport: { width: 1360, height: 900 }, headless: true },
  webServer: {
    command: "node tests/serve.cjs",
    url: "http://127.0.0.1:47839",
    reuseExistingServer: false,
  },
});
