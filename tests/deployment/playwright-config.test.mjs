import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"

const inspectConfig = (environment) => {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "--eval",
      `const config=(await import('./playwright.config.ts')).default; console.log(JSON.stringify({baseURL:config.use.baseURL, webServer:config.webServer ?? null}))`,
    ],
    { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, ...environment } },
  )
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

test("E2E_BASE_URL selects hosted mode without a local webServer", () => {
  const config = inspectConfig({
    E2E_BASE_URL: "https://hosted.example.test",
    PLAYWRIGHT_PORT: "4517",
  })
  assert.equal(config.baseURL, "https://hosted.example.test")
  assert.equal(config.webServer, null)
})

test("local mode wires the bounded discovery fixture and isolates the Next dist directory by port", () => {
  const config = inspectConfig({ E2E_BASE_URL: "", PLAYWRIGHT_PORT: "4518" })
  assert.equal(config.baseURL, "http://127.0.0.1:4518")
  assert.equal(config.webServer.length, 2)
  assert.match(config.webServer[0].command, /LOCAL_DISCOVERY_PORT=14518/)
  assert.match(config.webServer[0].command, /local-playwright-discovery-rpc\.mjs/)
  assert.equal(config.webServer[0].url, "https://127.0.0.1:14518/health")
  assert.equal(config.webServer[0].reuseExistingServer, false)
  assert.match(config.webServer[1].command, /\.next-playwright-4518/)
  assert.equal(config.webServer[1].env.NEXT_PUBLIC_SITE_URL, "http://127.0.0.1:4518")
  assert.equal(config.webServer[1].env.NEXT_PUBLIC_SUPABASE_URL, "https://127.0.0.1:14518")
  assert.equal(config.webServer[1].reuseExistingServer, false)
})
