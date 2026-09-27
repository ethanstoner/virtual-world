import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  reporter: "list",
  use: { baseURL: "http://localhost:5175" },
  webServer: {
    command: "npx vite --port 5175 --strictPort",
    url: "http://localhost:5175",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /touch/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /touch/ },
  ],
});
