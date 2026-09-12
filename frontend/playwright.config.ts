import { defineConfig } from "@playwright/test";
const port = process.env.TEST_PORT || "3000";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  timeout: 30000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    },
    viewport: { width: 1440, height: 1100 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `NEXT_DIST_DIR=.next-test npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
