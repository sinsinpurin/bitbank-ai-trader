import { defineConfig, devices } from "@playwright/test";

/**
 * apps/web の手動e2e用の最小構成。
 * apps/server(4000)とapps/web(3000)は事前に手動起動しておく前提
 * (.claude/skills/run-noctas/driver.mjs と同じ考え方)。webServerは使わない。
 */
export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
