import { defineConfig, devices } from "@playwright/test"

const port = process.env["PLAYWRIGHT_PORT"] ?? "3417"
const hostedBaseUrl = process.env["E2E_BASE_URL"]?.trim()
const baseURL = hostedBaseUrl || `http://127.0.0.1:${port}`
const isContinuousIntegration = Boolean(process.env["CI"])
const catalogPort = String(Number.parseInt(port, 10) + 10_000)
const localWebServers = hostedBaseUrl
  ? undefined
  : [
      {
        command: `exec env LOCAL_CATALOG_PORT=${catalogPort} node --experimental-strip-types tests/fixtures/local-catalog-rpc.mjs`,
        ignoreHTTPSErrors: true,
        reuseExistingServer: false,
        timeout: 30_000,
        url: `https://127.0.0.1:${catalogPort}/health`,
      },
      {
        command: `exec env PLAYWRIGHT_DIST_DIR=.next-playwright-${port} node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
        env: {
          ...process.env,
          NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS: "1",
          NEXT_PUBLIC_NAVER_MAP_CLIENT_ID:
            process.env["NEXT_PUBLIC_NAVER_MAP_CLIENT_ID"] ?? "test-client",
          NEXT_PUBLIC_POSTHOG_HOST:
            process.env["NEXT_PUBLIC_POSTHOG_HOST"] ?? "http://127.0.0.1:3498",
          NEXT_PUBLIC_POSTHOG_KEY: process.env["NEXT_PUBLIC_POSTHOG_KEY"] ?? "playwright-test-key",
          NEXT_PUBLIC_PLAYWRIGHT_TEST: "1",
          NEXT_PUBLIC_SITE_URL: baseURL,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "playwright-test-key",
          NEXT_PUBLIC_SUPABASE_URL: `https://127.0.0.1:${catalogPort}`,
          NEXT_PUBLIC_TEST_ALLOW_HTTP_LOOPBACK: "1",
          NODE_EXTRA_CA_CERTS: `${process.cwd()}/tests/fixtures/local-catalog-certificate.pem`,
          PLAYWRIGHT_DIST_DIR: `.next-playwright-${port}`,
        },
        reuseExistingServer: false,
        timeout: 120_000,
        url: baseURL,
      },
    ]

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isContinuousIntegration,
  retries: isContinuousIntegration ? 2 : 0,
  workers: isContinuousIntegration ? 1 : "50%",
  reporter: "line",
  use: {
    baseURL,
    ignoreHTTPSErrors: process.env["E2E_ALLOW_INSECURE_TLS"] === "1",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(localWebServers ? { webServer: localWebServers } : {}),
})
