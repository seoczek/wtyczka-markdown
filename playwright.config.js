import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "*.e2e.js",
  timeout: 30_000,
  workers: 1,
  reporter: "list"
});
