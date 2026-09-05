import { PilotPlacesResponseSchema, PilotRegionsResponseSchema } from "../../lib/pilot/dto"
import { expect, test } from "./map-test"

test("a collapsed mobile result dock recovers one outside region and fits its result", async ({
  page,
  request,
}) => {
  // Given one real catalog result represented outside the currently applied Seoul bounds.
  const source = PilotPlacesResponseSchema.parse(
    await (await request.get("/api/places?mode=places&limit=3")).json(),
  )
  const original = source.results[0]
  if (!original) throw new TypeError("Expected a catalog fixture result")
  const result = {
    ...original,
    place: {
      ...original.place,
      name: "성수 건강식당",
      address: "서울 성동구 성수동",
      latitude: 37.5446,
      longitude: 127.0558,
      region: "서울 성동구",
    },
  }
  const empty = { ...source, results: [], total: 0, nextCursor: null }
  const recovered = {
    ...source,
    sortBasis: "region_center" as const,
    sortOrigin: { latitude: result.place.latitude, longitude: result.place.longitude },
    results: [result],
    total: 1,
    nextCursor: null,
  }
  const regions = PilotRegionsResponseSchema.parse({
    catalogVersion: source.catalogVersion,
    total: 1,
    regions: [
      {
        id: "서울 성동구",
        label: "서울 성동구",
        count: 1,
        bounds: {
          southWest: { latitude: result.place.latitude, longitude: result.place.longitude },
          northEast: { latitude: result.place.latitude, longitude: result.place.longitude },
        },
      },
    ],
  })
  await page.route("**/api/places?**", async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get("query") !== "성수") return route.continue()
    if (url.searchParams.get("mode") === "regions") return route.fulfill({ json: regions })
    return route.fulfill({
      json: url.searchParams.get("region") === "서울 성동구" ? recovered : empty,
    })
  })
  await page.setViewportSize({ width: 375, height: 760 })
  await page.goto("/")

  // When the user asks to see the one matching place outside the map.
  await page.getByRole("searchbox").fill("성수")
  const recovery = page.getByRole("button", { name: "현재 지도 밖 1곳 보기" })
  await expect(recovery).toBeVisible()
  await recovery.click()

  // Then the matching list and existing SDK marker agree, and fitBounds used a safe max zoom.
  await expect(page.getByRole("button", { name: "성수 건강식당 자세히 보기" })).toBeVisible()
  await expect(page.getByRole("button", { name: "성수 건강식당", exact: true })).toBeVisible()
  await expect(page.getByLabel("검색 결과 수")).toHaveText("1곳 중 1곳")
  await expect(page.getByTestId("pilot-naver-map")).toHaveAttribute(
    "data-fit-bounds",
    /"maxZoom":15/u,
  )
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.outerHTML ?? "missing"))
    .toContain("resultsHeader")
  await page.screenshot({ path: test.info().outputPath("single-region-recovery.png") })
})

test("multiple outside regions require an explicit region choice", async ({ page, request }) => {
  const source = PilotPlacesResponseSchema.parse(
    await (await request.get("/api/places?mode=places&limit=3")).json(),
  )
  const original = source.results[0]
  if (!original) throw new TypeError("Expected a catalog fixture result")
  const busan = {
    ...original,
    place: {
      ...original.place,
      name: "서면 균형식당",
      address: "부산 부산진구 서면",
      latitude: 35.1577,
      longitude: 129.059,
      region: "부산 부산진구",
    },
  }
  const empty = { ...source, results: [], total: 0, nextCursor: null }
  const recovered = {
    ...source,
    sortBasis: "region_center" as const,
    sortOrigin: { latitude: busan.place.latitude, longitude: busan.place.longitude },
    results: [busan],
    total: 1,
    nextCursor: null,
  }
  const regions = PilotRegionsResponseSchema.parse({
    catalogVersion: source.catalogVersion,
    total: 3,
    regions: [
      {
        id: "서울 영등포구",
        label: "서울 영등포구",
        count: 2,
        bounds: {
          southWest: { latitude: 37.52, longitude: 126.91 },
          northEast: { latitude: 37.53, longitude: 126.93 },
        },
      },
      {
        id: "부산 부산진구",
        label: "부산 부산진구",
        count: 1,
        bounds: {
          southWest: { latitude: 35.15, longitude: 129.05 },
          northEast: { latitude: 35.16, longitude: 129.06 },
        },
      },
    ],
  })
  await page.route("**/api/places?**", async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get("query") !== "서면") return route.continue()
    if (url.searchParams.get("mode") === "regions") return route.fulfill({ json: regions })
    return route.fulfill({
      json: url.searchParams.get("region") === "부산 부산진구" ? recovered : empty,
    })
  })
  await page.setViewportSize({ width: 375, height: 760 })
  await page.goto("/")
  await page.getByRole("searchbox").fill("서면")

  await page.getByRole("button", { name: "현재 지도 밖 3곳 보기" }).click()
  await expect(page.getByRole("heading", { name: "지도 밖 결과" })).toBeFocused()
  await expect(page.getByRole("button", { name: "서울 영등포구 2곳" })).toBeVisible()
  await page.getByRole("button", { name: "부산 부산진구 1곳" }).click()
  await expect(page.getByRole("button", { name: "서면 균형식당 자세히 보기" })).toBeVisible()
})

test("global zero and aggregate failure remain distinct completed states", async ({
  page,
  request,
}) => {
  const source = PilotPlacesResponseSchema.parse(
    await (await request.get("/api/places?mode=places&limit=1")).json(),
  )
  const empty = { ...source, results: [], total: 0, nextCursor: null }
  let aggregateFails = false
  await page.route("**/api/places?**", async (route) => {
    const url = new URL(route.request().url())
    if (!url.searchParams.get("query")?.startsWith("없는별칭")) return route.continue()
    if (url.searchParams.get("mode") === "places") return route.fulfill({ json: empty })
    if (aggregateFails) return route.fulfill({ status: 503, json: { error: "unavailable" } })
    return route.fulfill({
      json: { catalogVersion: source.catalogVersion, total: 0, regions: [] },
    })
  })
  await page.goto("/")
  await page.getByRole("searchbox").fill("없는별칭")
  await expect(page.getByText("이 조건에서 찾은 곳이 없어요.")).toBeVisible()
  await expect(page.getByRole("button", { name: /현재 지도 밖/u })).toHaveCount(0)

  aggregateFails = true
  await page.getByRole("searchbox").fill("없는별칭 ")
  await expect(page.getByRole("button", { name: "지도 밖 결과 다시 확인" })).toBeVisible()
  await expect(page.getByText("이 조건에서 찾은 곳이 없어요.")).toHaveCount(0)
})

test("aggregate failure does not replace good local results", async ({ page }) => {
  await page.route("**/api/places?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") === "regions")
      return route.fulfill({ status: 503, json: { error: "unavailable" } })
    return route.continue()
  })
  await page.goto("/")
  await expect(page.locator("[data-pilot-place-id]").first()).toBeVisible()
  await expect(page.getByRole("button", { name: "지도 밖 결과 다시 확인" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "메뉴 다시 불러오기" })).toHaveCount(0)
})

test("map provider failure leaves the result list usable", async ({ page }) => {
  await page.route("https://oapi.map.naver.com/**", (route) =>
    route.fulfill({ status: 503, contentType: "text/plain", body: "unavailable" }),
  )
  await page.goto("/")
  await expect(page.getByText("지도를 불러오지 못했어요.")).toBeVisible()
  const firstResult = page.locator("[data-pilot-place-id]").first()
  await expect(firstResult).toBeVisible()
  await firstResult.click()
  await expect(page.getByRole("region", { name: "메뉴 둘러보기", exact: true })).toBeVisible()
})
