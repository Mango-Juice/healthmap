import { defineConfig, devices } from "@playwright/test"

const port = process.env["PLAYWRIGHT_PORT"] ?? "3417"
const baseURL = `http://127.0.0.1:${port}`
const isContinuousIntegration = Boolean(process.env["CI"])

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isContinuousIntegration,
  retries: isContinuousIntegration ? 2 : 0,
  workers: isContinuousIntegration ? 1 : "50%",
  reporter: "line",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `exec node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
    env: {
      ...process.env,
      NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS: "1",
      NEXT_PUBLIC_NAVER_MAP_CLIENT_ID:
        process.env["NEXT_PUBLIC_NAVER_MAP_CLIENT_ID"] ?? "test-client",
      NEXT_PUBLIC_POSTHOG_HOST: process.env["NEXT_PUBLIC_POSTHOG_HOST"] ?? "http://127.0.0.1:3498",
      NEXT_PUBLIC_POSTHOG_KEY: process.env["NEXT_PUBLIC_POSTHOG_KEY"] ?? "playwright-test-key",
      NEXT_PUBLIC_PLAYWRIGHT_TEST: "1",
      NEXT_PUBLIC_TEST_ALLOW_HTTP_LOOPBACK: "1",
    },
    url: baseURL,
    reuseExistingServer: !isContinuousIntegration,
    timeout: 120_000,
  },
})
