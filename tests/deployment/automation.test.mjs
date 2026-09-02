import assert from "node:assert/strict"
import { createServer } from "node:http"
import { after, before, test } from "node:test"
import { runProductionSmoke } from "../../scripts/deploy/production-smoke.mjs"
import { createProductionCatalog, createProductionFetch } from "./catalog-fixture.mjs"

let server
let baseUrl

const productionCatalog = createProductionCatalog()
const expectedCatalogVersion = productionCatalog.catalogVersion

before(async () => {
  server = createServer((request, response) => {
    const responses = {
      "/": ["text/html; charset=utf-8", "<main>건강식 지도</main>"],
      "/privacy": ["text/html; charset=utf-8", "개인정보 및 분석 안내"],
      "/api/map-catalog": ["application/json", JSON.stringify(productionCatalog)],
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
  assert.equal(
    await runProductionSmoke(new URL(baseUrl), fetch, { expectedCatalogVersion }),
    "Production smoke passed",
  )
})

test("smoke runner accepts production provenance without mock count or name assumptions", async () => {
  assert.equal(
    await runProductionSmoke(new URL(baseUrl), createProductionFetch(productionCatalog), {
      expectedCatalogVersion,
    }),
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
    () =>
      runProductionSmoke(new URL(baseUrl), createProductionFetch(invalidCatalog), {
        expectedCatalogVersion,
      }),
    /strict catalog contract/,
  )
})

test("smoke runner rejects production URL userinfo in NAVER and evidence provenance", async () => {
  const hostilePlaceCatalog = {
    ...productionCatalog,
    places: productionCatalog.places.map((place) => ({
      ...place,
      naverPlaceUrl: "https://user:password@map.naver.com/p/place/1",
    })),
  }
  const hostileMenuCatalog = {
    ...productionCatalog,
    menus: productionCatalog.menus.map((menu) => ({
      ...menu,
      evidenceUrl: "https://user:password@sources.example.test/evidence/1",
    })),
  }

  await assert.rejects(
    () =>
      runProductionSmoke(new URL(baseUrl), createProductionFetch(hostilePlaceCatalog), {
        expectedCatalogVersion,
      }),
    /strict catalog contract/,
  )
  await assert.rejects(
    () =>
      runProductionSmoke(new URL(baseUrl), createProductionFetch(hostileMenuCatalog), {
        expectedCatalogVersion,
      }),
    /strict catalog contract/,
  )
})

test("smoke runner safety-scans an unsupported-method response before accepting HTTP 405", async () => {
  await assert.rejects(
    () =>
      runProductionSmoke(
        new URL(baseUrl),
        (input, init) => {
          const url = new URL(input)
          if (url.pathname === "/api/map-catalog" && init?.method === "POST") {
            return Promise.resolve(
              new Response("service_role should never be exposed", {
                headers: { "set-cookie": "session=unsafe" },
                status: 405,
              }),
            )
          }
          return createProductionFetch(productionCatalog)(input, init)
        },
        { expectedCatalogVersion },
      ),
    /unexpectedly sets a cookie|credential-shaped value/,
  )
})

test("smoke runner rejects malformed production record field types", async () => {
  const malformedCatalog = {
    ...productionCatalog,
    places: productionCatalog.places.map((place) => ({ ...place, latitude: "37.5" })),
  }

  await assert.rejects(
    () =>
      runProductionSmoke(new URL(baseUrl), createProductionFetch(malformedCatalog), {
        expectedCatalogVersion,
      }),
    /strict catalog contract/,
  )
})

test("smoke runner rejects unpublished and orphaned production rows", async () => {
  const unpublishedCatalog = {
    ...productionCatalog,
    places: productionCatalog.places.map((place) => ({ ...place, published: false })),
  }
  const orphanedCatalog = {
    ...productionCatalog,
    menus: productionCatalog.menus.map((menu) => ({
      ...menu,
      placeId: "00000000-0000-4000-8000-000000000099",
    })),
  }
  const mixedModeCatalog = {
    dataMode: "production",
    places: productionCatalog.places.map((place) => ({
      ...place,
      dataMode: "mock",
      slug: "mock-place",
      naverPlaceUrl: "https://example.invalid/mock-directions/mock-place",
    })),
    menus: productionCatalog.menus.map((menu) => ({
      ...menu,
      dataMode: "mock",
      evidenceUrl: "https://example.invalid/mock-evidence/mock-menu",
    })),
  }

  await assert.rejects(
    () =>
      runProductionSmoke(new URL(baseUrl), createProductionFetch(unpublishedCatalog), {
        expectedCatalogVersion,
      }),
    /current valid published menu/,
  )
  await assert.rejects(
    () =>
      runProductionSmoke(new URL(baseUrl), createProductionFetch(orphanedCatalog), {
        expectedCatalogVersion,
      }),
    /current valid published menu/,
  )
  await assert.rejects(
    () =>
      runProductionSmoke(new URL(baseUrl), createProductionFetch(mixedModeCatalog), {
        expectedCatalogVersion,
      }),
    /strict catalog contract/,
  )
})

test("smoke runner rejects a misleading HTTP 200 response", async () => {
  await assert.rejects(
    () =>
      runProductionSmoke(
        new URL(baseUrl),
        (input, init) => {
          const url = new URL(input)
          return url.pathname === "/"
            ? Promise.resolve(new Response("not an application", { status: 200 }))
            : fetch(input, init)
        },
        { expectedCatalogVersion },
      ),
    /Korean application marker/,
  )
})

test("smoke runner rejects wrong mode, counts, and legacy contract keys", async () => {
  await assert.rejects(
    () =>
      runProductionSmoke(
        new URL(baseUrl),
        (input, init) => {
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
        },
        { expectedCatalogVersion },
      ),
    /strict catalog contract/,
  )
})

test("smoke runner rejects unknown fields and secret-shaped catalog bodies", async () => {
  await assert.rejects(
    () =>
      runProductionSmoke(
        new URL(baseUrl),
        (input, init) => {
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
        },
        { expectedCatalogVersion },
      ),
    /credential-shaped value/,
  )
})
