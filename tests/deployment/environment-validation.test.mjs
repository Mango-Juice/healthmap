import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"
import {
  parseBaseUrl,
  parseExpectedCatalogVersion,
} from "../../scripts/deploy/production-smoke.mjs"
import {
  formatValidationFailure,
  validatePublicEnvironment,
} from "../../scripts/deploy/validate-environment.mjs"

const safeEnvironment = {
  NEXT_PUBLIC_NAVER_MAP_CLIENT_ID: "naver-client-placeholder",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-placeholder",
  NEXT_PUBLIC_POSTHOG_KEY: "posthog-placeholder",
  NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
  NEXT_PUBLIC_SITE_URL: "https://healthmap.example.test",
}

test("environment validation reports names but never values", () => {
  const result = validatePublicEnvironment({
    ...safeEnvironment,
    NEXT_PUBLIC_POSTHOG_KEY: "do-not-print-this-value",
    NEXT_PUBLIC_SITE_URL: "not-a-url",
    NEXT_PUBLIC_SUPABASE_URL: "",
  })
  const message = formatValidationFailure(result)

  assert.deepEqual(result.missing, ["NEXT_PUBLIC_SUPABASE_URL"])
  assert.deepEqual(result.malformed, ["NEXT_PUBLIC_SITE_URL"])
  assert.match(message, /NEXT_PUBLIC_SUPABASE_URL/)
  assert.match(message, /NEXT_PUBLIC_SITE_URL/)
  assert.doesNotMatch(message, /do-not-print-this-value|not-a-url/)
})

test("environment validation accepts safe configured placeholders", () => {
  assert.deepEqual(validatePublicEnvironment(safeEnvironment), { malformed: [], missing: [] })
})

test("environment validation rejects remote HTTP and script-shaped origins by name only", () => {
  const result = validatePublicEnvironment({
    ...safeEnvironment,
    NEXT_PUBLIC_POSTHOG_HOST: "http://analytics.example.test",
    NEXT_PUBLIC_SITE_URL: "javascript:alert('do-not-echo')",
    NEXT_PUBLIC_SUPABASE_URL: "data:text/plain,do-not-echo",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sk_live_do-not-echo",
  })
  const message = formatValidationFailure(result)

  assert.deepEqual(result.malformed, [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_POSTHOG_HOST",
    "NEXT_PUBLIC_SITE_URL",
  ])
  assert.doesNotMatch(message, /do-not-echo|sk_live/)
})

test("environment validator CLI fails safely for malformed values", () => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/deploy/validate-environment.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ...safeEnvironment,
        NEXT_PUBLIC_POSTHOG_HOST: "http://bad-host.invalid",
      },
    },
  )

  assert.equal(result.status, 1)
  assert.match(result.stderr, /NEXT_PUBLIC_POSTHOG_HOST/)
  assert.doesNotMatch(result.stderr, /bad-host\.invalid/)
})

test("smoke command rejects malformed origins without echoing their value", () => {
  assert.throws(
    () => parseBaseUrl(["--base-url", "https://user:secret@healthmap.example.test/private"]),
    (error) =>
      error instanceof Error &&
      error.message.includes("Smoke configuration invalid") &&
      !error.message.includes("secret"),
  )
})

test("smoke command requires a non-hostile expected catalog version without echoing it", () => {
  assert.throws(
    () => parseExpectedCatalogVersion(["--base-url", "https://healthmap.example.test"]),
    /--expected-catalog-version is required/,
  )
  assert.throws(
    () => parseExpectedCatalogVersion(["--expected-catalog-version", "catalog\nsecret"]),
    (error) =>
      error instanceof Error &&
      error.message.includes("--expected-catalog-version") &&
      !error.message.includes("secret"),
  )
})
