import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import { PUBLIC_ENVIRONMENT_NAMES } from "../../scripts/deploy/validate-environment.mjs"

test("Vercel and CI pin frozen installs, quality gates, and deployment commands", async () => {
  const [vercelConfig, ci, operations, packageJson] = await Promise.all([
    readFile("vercel.json", "utf8"),
    readFile(".github/workflows/ci.yml", "utf8"),
    readFile("docs/operations.md", "utf8"),
    readFile("package.json", "utf8"),
  ])

  assert.match(vercelConfig, /"installCommand": "pnpm install --frozen-lockfile"/)
  assert.match(vercelConfig, /"X-Content-Type-Options"/)
  assert.match(vercelConfig, /"Content-Security-Policy"/)
  assert.match(vercelConfig, /"Permissions-Policy"/)
  assert.match(
    vercelConfig,
    /script-src[^;]+https:\/\/nrbe[.]pstatic[.]net/,
    "NAVER style JSONP must be allowed by script-src",
  )
  assert.match(
    vercelConfig,
    /connect-src[^;]+https:\/\/us[.]i[.]posthog[.]com/,
    "the configured PostHog ingestion origin must be allowed by connect-src",
  )
  assert.doesNotMatch(
    vercelConfig,
    /https:\/\/vercel[.]live/,
    "the optional Preview Toolbar must not broaden the production CSP",
  )
  assert.match(vercelConfig, /pnpm deploy:validate:hosted && pnpm build/)
  assert.match(ci, /pnpm deploy:validate/)
  assert.match(ci, /pnpm docs:check/)
  assert.match(ci, /pnpm test:integration/)
  assert.doesNotMatch(ci, /--data-mode/)
  assert.match(
    operations,
    /Before retrieving credentials or opening the network, the Python promotion client verifies[\s\S]+reviewApprovalSha256[\s\S]+locally/,
  )
  assert.match(
    operations,
    /fixed 14-argument RPC[\s\S]+does not receive approval JSON or an approval hash/,
  )
  assert.match(
    operations,
    /server compare approvals and deterministic rechecks exactly against[\s\S]+stored rows/,
  )
  assert.doesNotMatch(operations, /sends the exact canonical review-approval JSON/)
  assert.match(
    packageJson,
    /"deploy:smoke": "node --experimental-strip-types scripts\/deploy\/production-smoke\.mjs"/,
  )
  assert.doesNotMatch(operations, /--data-mode/)
})

test("the public template names match the runtime validator", async () => {
  const envExample = await readFile(".env.example", "utf8")
  for (const name of PUBLIC_ENVIRONMENT_NAMES) {
    assert.match(envExample, new RegExp(`^${name}=`, "m"))
  }
  assert.doesNotMatch(envExample, /SUPABASE_SERVICE_ROLE_KEY=/)
})

test("Vercel source uploads exclude local evidence and nonstandard build outputs", async () => {
  const vercelIgnore = await readFile(".vercelignore", "utf8")
  const rules = new Set(
    vercelIgnore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#")),
  )

  assert.ok(rules.has(".omo"), ".omo evidence must never be uploaded to Vercel")
  assert.ok(rules.has(".next-*"), "isolated local Next.js builds must not be uploaded")
  assert.ok(rules.has(".env"), "root environment files must not be uploaded")
  assert.ok(rules.has(".env.*"), "environment variants must not be uploaded")
})
