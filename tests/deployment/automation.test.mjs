import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { after, before, test } from "node:test"
import {
  parseBaseUrl,
  parseDataMode,
  runProductionSmoke,
} from "../../scripts/deploy/production-smoke.mjs"
import {
  formatValidationFailure,
  PUBLIC_ENVIRONMENT_NAMES,
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
  const secretLikeValue = "do-not-print-this-value"
  const result = validatePublicEnvironment({
    ...safeEnvironment,
    NEXT_PUBLIC_POSTHOG_KEY: secretLikeValue,
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
  const secretLikeValue = "sk_live_do-not-echo"
  const result = validatePublicEnvironment({
    ...safeEnvironment,
    NEXT_PUBLIC_POSTHOG_HOST: "http://analytics.example.test",
    NEXT_PUBLIC_SITE_URL: "javascript:alert('do-not-echo')",
    NEXT_PUBLIC_SUPABASE_URL: "data:text/plain,do-not-echo",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secretLikeValue,
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

test("smoke command selects an explicit catalog mode", () => {
  assert.equal(parseDataMode(["--data-mode", "production"]), "production")
  assert.throws(
    () => parseDataMode(["--data-mode", "staging"]),
    /Smoke configuration invalid: --data-mode must be mock or production/,
  )
})

let server
let baseUrl

const productionCatalog = {
  dataMode: "production",
  places: [
    {
      dataMode: "production",
      id: "6dd657be-fc3b-4bb8-8e67-fabbee0f2ea0",
      slug: "production-fixture-place",
      name: "Production fixture place",
      address: "Fixture address",
      latitude: 37.5,
      longitude: 127.03,
      naverPlaceUrl: "https://map.naver.com/p/place/1",
      primaryTag: "balanced",
      healthTags: ["balanced"],
      published: true,
    },
  ],
  menus: [
    {
      dataMode: "production",
      id: "bc6b1050-539e-4d28-8493-5920eae54248",
      placeId: "6dd657be-fc3b-4bb8-8e67-fabbee0f2ea0",
      name: "Production fixture menu",
      healthTags: ["balanced"],
      evidenceUrl: "https://sources.example.test/production-fixture",
      verifiedAt: "2026-08-14",
      displayOrder: 0,
      published: true,
    },
  ],
}

const createProductionFetch = (catalog) => (input, init) => {
  const url = new URL(input)
  return url.pathname === "/" && init?.method !== "POST"
    ? Promise.resolve(new Response("<main>건강식 지도</main>", { status: 200 }))
    : url.pathname === "/privacy" && init?.method !== "POST"
      ? Promise.resolve(new Response("개인정보 및 분석 안내", { status: 200 }))
      : url.pathname === "/api/map-catalog" && init?.method !== "POST"
        ? Promise.resolve(
            new Response(JSON.stringify(catalog), {
              headers: { "content-type": "application/json" },
              status: 200,
            }),
          )
        : fetch(input, init)
}

before(async () => {
  server = createServer((request, response) => {
    const responses = {
      "/": ["text/html; charset=utf-8", "<main>건강식 지도 샘플 데이터</main>"],
      "/privacy": ["text/html; charset=utf-8", "개인정보 및 분석 안내 목업 데이터"],
      "/api/map-catalog": [
        "application/json",
        JSON.stringify({
          dataMode: "mock",
          menus: Array.from({ length: 10 }, (_, index) => ({
            dataMode: "mock",
            name: `메뉴 ${index + 1} 샘플`,
          })),
          places: Array.from({ length: 5 }, (_, index) => ({
            dataMode: "mock",
            name: `장소 ${index + 1} 샘플`,
          })),
        }),
      ],
    }
    const current = responses[request.url]
    if (request.method === "POST" && request.url === "/api/map-catalog") {
      response.writeHead(405).end()
      return
    }
    if (!current) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { "content-type": current[0] }).end(current[1])
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
})

test("smoke runner proves HTTP content, catalog shape, and route behavior", async () => {
  assert.equal(await runProductionSmoke(new URL(baseUrl), "mock"), "Production smoke passed")
})

test("smoke runner accepts production provenance without mock count or name assumptions", async () => {
  assert.equal(
    await runProductionSmoke(
      new URL(baseUrl),
      "production",
      createProductionFetch(productionCatalog),
    ),
    "Production smoke passed",
  )
})

test("smoke runner rejects mock-only production evidence URLs", async () => {
  const invalidCatalog = {
    ...productionCatalog,
    menus: productionCatalog.menus.map((menu) => ({
      ...menu,
      evidenceUrl: "https://example.invalid/mock-evidence/fixture",
    })),
  }
  await assert.rejects(
    () => runProductionSmoke(new URL(baseUrl), "production", createProductionFetch(invalidCatalog)),
    /production menus lack the strict public shape or evidence provenance/,
  )
})

test("smoke runner rejects a misleading HTTP 200 response", async () => {
  await assert.rejects(
    () =>
      runProductionSmoke(new URL(baseUrl), (input, init) => {
        const url = new URL(input)
        return url.pathname === "/"
          ? Promise.resolve(new Response("not an application", { status: 200 }))
          : fetch(input, init)
      }),
    /Korean application marker/,
  )
})

test("smoke runner rejects wrong mode, counts, and legacy contract keys", async () => {
  await assert.rejects(
    () =>
      runProductionSmoke(new URL(baseUrl), (input, init) => {
        const url = new URL(input)
        return url.pathname === "/api/map-catalog" && init?.method !== "POST"
          ? Promise.resolve(
              new Response(
                JSON.stringify({
                  data_mode: "production",
                  places: Array.from({ length: 5 }, (_, index) => ({
                    name: `장소 ${index + 1} 샘플`,
                  })),
                  menus: [],
                }),
                { headers: { "content-type": "application/json" }, status: 200 },
              ),
            )
          : fetch(input, init)
      }),
    /strict \{dataMode, places, menus\} contract/,
  )
})

test("smoke runner rejects unknown fields and secret-shaped catalog bodies", async () => {
  await assert.rejects(
    () =>
      runProductionSmoke(new URL(baseUrl), (input, init) => {
        const url = new URL(input)
        return url.pathname === "/api/map-catalog" && init?.method !== "POST"
          ? Promise.resolve(
              new Response(
                JSON.stringify({
                  dataMode: "mock",
                  menus: Array.from({ length: 10 }),
                  places: Array.from({ length: 5 }, () => ({ name: "장소 샘플" })),
                  service_role: "should-not-leak",
                }),
                { headers: { "content-type": "application/json" }, status: 200 },
              ),
            )
          : fetch(input, init)
      }),
    /credential-shaped value/,
  )
})

test("Vercel and CI pin frozen installs, quality gates, and deployment commands", async () => {
  const [vercelConfig, ci] = await Promise.all([
    readFile("vercel.json", "utf8"),
    readFile(".github/workflows/ci.yml", "utf8"),
  ])

  assert.match(vercelConfig, /"installCommand": "pnpm install --frozen-lockfile"/)
  assert.match(vercelConfig, /"X-Content-Type-Options"/)
  assert.match(vercelConfig, /"Content-Security-Policy"/)
  assert.match(vercelConfig, /"Permissions-Policy"/)
  assert.match(vercelConfig, /pnpm deploy:validate:hosted && pnpm build/)
  assert.match(ci, /pnpm deploy:validate/)
  assert.match(ci, /pnpm docs:check/)
  assert.match(ci, /pnpm test:integration/)
  assert.match(ci, /pnpm start --port "\$PORT"/)
  assert.match(ci, /pnpm deploy:smoke -- --base-url http:\/\/127\.0\.0\.1:\$PORT/)
  assert.match(
    ci,
    /env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY pnpm start --port "\$PORT"/,
  )
  assert.match(
    ci,
    /env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY pnpm build/,
  )
  assert.equal(
    (
      ci.match(/pnpm deploy:smoke -- --base-url http:\/\/127\.0\.0\.1:\$PORT --data-mode mock/g) ??
      []
    ).length,
    2,
  )
})

test("the public template names match the runtime validator", async () => {
  const envExample = await readFile(".env.example", "utf8")
  for (const name of PUBLIC_ENVIRONMENT_NAMES) {
    assert.match(envExample, new RegExp(`^${name}=`, "m"))
  }
  assert.doesNotMatch(envExample, /SUPABASE_SERVICE_ROLE_KEY=/)
})
