import { PilotPlacesResponseSchema } from "../../lib/pilot/dto"

import { expect, test } from "./map-test"

test("location denial keeps nearby food discovery available", async ({ page }) => {
  // Given a browser that declines its initial location request.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
          error({
            code: 1,
            message: "denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          }),
      },
    })
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  // When the Pilot opens.
  await page.goto("/")
  // Then the fallback remains searchable without exposing a false location claim.
  await expect(page.getByRole("application", { name: "NAVER 건강식 지도" })).toBeVisible()
  await expect(page.getByLabel("검색 결과 수")).toHaveText(/^\d+곳 중 \d+곳$/u)
  await expect(page.locator("[data-pilot-place-id]").first()).toBeAttached()
})

test("pagination shares the total and appends matching places", async ({ page }) => {
  await page.route("**/api/places?**", async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get("mode") !== "places") return route.continue()
    url.searchParams.set("limit", "1")
    return route.continue({ url: url.toString() })
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await expect(page.locator("[data-pilot-place-id]")).toHaveCount(1)
  const firstTotal = await page.getByLabel("검색 결과 수").innerText()
  const totalMatch = /^([0-9]+)곳 중 1곳$/u.exec(firstTotal)
  if (!totalMatch) throw new TypeError("Expected a one-item Pilot page")
  await page.getByRole("button", { name: "메뉴 더 보기" }).click()
  await expect(page.locator("[data-pilot-place-id]")).toHaveCount(2)
  await expect(page.getByLabel("검색 결과 수")).toHaveText(`${totalMatch[1]}곳 중 2곳`)
})

test("failed requests recover without dropping the search controls", async ({ page }) => {
  let fail = true
  await page.route("**/api/places?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") === "places" && fail)
      return route.fulfill({ status: 503, json: { error: "catalog_unavailable", retry: true } })
    return route.continue()
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await expect(page.getByRole("button", { name: "장소 다시 불러오기" })).toBeVisible()
  fail = false
  await page.getByRole("button", { name: "장소 다시 불러오기" }).click()
  await expect(page.locator("[data-pilot-place-id]").first()).toBeVisible()
})

test("common menu notice and directions survive media excluded for another menu", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/places?mode=places&limit=50")
  const data = PilotPlacesResponseSchema.parse(await response.json())
  const original = data.results.find((candidate) => candidate.menus.length > 1)
  if (!original) throw new TypeError("Expected a Pilot result with two matching menus")
  const matchingMenu = original.menus[0]
  const wrongMenu = original.menus.find((menu) => menu.id !== matchingMenu?.id)
  if (!matchingMenu || !wrongMenu)
    throw new TypeError("Expected distinct matching and nonmatching menus")
  const wrongMediaUrl = "https://salady.com/test-wrong-menu.jpg"
  const fixture = PilotPlacesResponseSchema.parse({
    catalogVersion: data.catalogVersion,
    sortBasis: data.sortBasis,
    sortOrigin: data.sortOrigin,
    nextCursor: null,
    results: [
      {
        ...original,
        matchingMenuIds: [matchingMenu.id],
        place: {
          ...original.place,
          media: [
            {
              url: wrongMediaUrl,
              alt: "다른 메뉴",
              sourceUrl: "https://salady.com/",
              scope: "brand",
              usageApproved: true,
              subject: "menu",
              menuIds: [wrongMenu.id],
              attribution: "Salady",
            },
          ],
        },
        menus: original.menus.map((menu) => ({
          ...menu,
          branchApplicability: "brand_common_unverified",
          applicabilityNotice: "브랜드 공통 메뉴 · 지점별 판매 확인 필요",
        })),
      },
    ],
    total: 1,
  })
  const result = fixture.results[0]
  if (!result) throw new TypeError("Expected a parsed Pilot media fixture")
  await page.route("**/api/places?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") !== "places")
      return route.continue()
    return route.fulfill({ json: fixture })
  })
  await page.route("**/api/places/*", (route) =>
    route.fulfill({
      json: { catalogVersion: data.catalogVersion, place: result.place, menus: result.menus },
    }),
  )
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  const card = page.locator("[data-pilot-place-id]").first()
  await expect(card).toBeVisible()
  await card.click()
  await expect(page.getByRole("region", { name: "메뉴 둘러보기", exact: true })).toBeVisible()
  await expect(page.getByRole("img", { name: "다른 메뉴" })).toHaveCount(0)
  await expect(page.getByRole("link", { name: /길찾기/ })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(card).toBeFocused()
})

test("initial location is requested once and scopes the first place request", async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          calls += 1
          document.documentElement.dataset["locationCalls"] = String(calls)
          success({
            coords: {
              latitude: 35.18,
              longitude: 129.07,
              accuracy: 50,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: 1,
            toJSON: () => ({}),
          })
        },
      },
    })
  })
  const query = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return (
      url.pathname === "/api/places" &&
      url.searchParams.get("mode") === "places" &&
      Number(url.searchParams.get("south")) < 35.18 &&
      Number(url.searchParams.get("north")) > 35.18 &&
      Number(url.searchParams.get("west")) < 129.07
    )
  })
  await page.goto("/")
  const url = new URL((await query).url())
  expect(Number(url.searchParams.get("south"))).toBeLessThan(35.18)
  expect(Number(url.searchParams.get("north"))).toBeGreaterThan(35.18)
  expect(Number(url.searchParams.get("west"))).toBeLessThan(129.07)
  await expect(page.locator("html")).toHaveAttribute("data-location-calls", "1")
})

test("a late search response cannot overwrite a newer query", async ({ page, request }) => {
  const response = await request.get("/api/places?mode=places&limit=1")
  const data = PilotPlacesResponseSchema.parse(await response.json())
  let release: (() => void) | undefined
  let delivered: (() => void) | undefined
  const oldDelivery = new Promise<void>((resolve) => {
    delivered = resolve
  })
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route("**/api/places?**", async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get("mode") !== "places") return route.continue()
    if (url.searchParams.get("query") === "older") {
      await held
      await route.fulfill({ json: data })
      delivered?.()
      return
    }
    if (url.searchParams.get("query") === "newer")
      return route.fulfill({ json: { ...data, results: [], total: 0, nextCursor: null } })
    return route.continue()
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  const oldRequest = page.waitForRequest(
    (request) => new URL(request.url()).searchParams.get("query") === "older",
  )
  await page.getByRole("searchbox").fill("older")
  await oldRequest
  await page.getByRole("searchbox").fill("newer")
  await expect(page.getByLabel("검색 결과 수")).toHaveText("0곳 중 0곳")
  release?.()
  await oldDelivery
  await expect(page.locator("[data-pilot-place-id]")).toHaveCount(0)
  await expect(page.getByRole("searchbox")).toHaveValue("newer")
})

test("regional fallback failure retains a retry action", async ({ page, request }) => {
  const source = PilotPlacesResponseSchema.parse(
    await (await request.get("/api/places?mode=places&limit=1")).json(),
  )
  let failed = true
  await page.route("**/api/places?**", async (route) => {
    const mode = new URL(route.request().url()).searchParams.get("mode")
    if (failed && mode === "regions")
      return route.fulfill({ status: 503, json: { error: "catalog_unavailable", retry: true } })
    if (mode === "places")
      return route.fulfill({ json: { ...source, nextCursor: null, results: [], total: 0 } })
    return route.continue()
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await expect(page.getByRole("button", { name: "지도 밖 결과 다시 확인" })).toBeVisible()
  failed = false
  await page.getByRole("button", { name: "지도 밖 결과 다시 확인" }).click()
  await expect(page.getByRole("button", { name: /현재 지도 밖/u })).toBeVisible()
})
