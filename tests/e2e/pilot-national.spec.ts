import { PilotPlacesResponseSchema } from "../../lib/pilot/dto"

import { expect, test } from "./map-test"

test("location denial offers selectable national regions", async ({ page }) => {
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
  // Then region navigation remains available without an empty local default.
  await expect(page.getByRole("combobox", { name: "지역 선택" })).toBeVisible()
  await expect(page.getByLabel("검색 결과 수")).toHaveText(/[1-9]\d*곳 · 지역별 탐색/)
  await expect(page.getByRole("combobox", { name: "지역 선택" }).locator("option")).not.toHaveCount(
    1,
  )
})

test("pagination shares the total and appends matching places", async ({ page, request }) => {
  const response = await request.get("/api/places?mode=places&limit=1")
  const first = PilotPlacesResponseSchema.parse(await response.json())
  await page.route("**/api/places?**", async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get("mode") !== "places") return route.continue()
    if (url.searchParams.has("cursor")) {
      url.searchParams.set("limit", "1")
      url.searchParams.delete("region")
      return route.continue({ url: url.toString() })
    }
    return route.fulfill({ json: first })
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await page.getByLabel("지역 선택").selectOption({ index: 1 })
  await expect(page.locator("[data-pilot-place-id]")).toHaveCount(1)
  await page.getByRole("button", { name: "메뉴 더 보기" }).click()
  await expect(page.locator("[data-pilot-place-id]")).toHaveCount(2)
  await expect(page.getByLabel("검색 결과 수")).toHaveText(`${first.total}곳 · 2곳 표시`)
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
  await page.getByLabel("지역 선택").selectOption({ index: 1 })
  await expect(page.getByRole("button", { name: "메뉴 다시 불러오기" })).toBeVisible()
  fail = false
  await page.getByRole("button", { name: "메뉴 다시 불러오기" }).click()
  await expect(page.locator("[data-pilot-place-id]").first()).toBeVisible()
})

test("common menu notice and directions survive a failed authorized image", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/places?mode=places&limit=1")
  const data = PilotPlacesResponseSchema.parse(await response.json())
  const original = data.results[0]
  if (!original) throw new TypeError("Expected selected Pilot menu")
  const result = {
    ...original,
    place: {
      ...original.place,
      media: [
        {
          url: "https://salady.com/test-authorized-missing.jpg",
          alt: "브랜드 메뉴",
          sourceUrl: "https://salady.com",
          scope: "brand",
          usageApproved: true,
        },
      ],
    },
    menus: original.menus.map((menu) => ({
      ...menu,
      branchApplicability: "brand_common_unverified",
      applicabilityNotice: "브랜드 공통 메뉴 · 지점별 판매 확인 필요",
    })),
  }
  await page.route("https://salady.com/**", (route) => route.abort())
  await page.route("**/api/places?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") !== "places")
      return route.continue()
    return route.fulfill({ json: { ...data, results: [result], nextCursor: null } })
  })
  await page.route("**/api/places/*", (route) =>
    route.fulfill({
      json: { catalogVersion: data.catalogVersion, place: result.place, menus: result.menus },
    }),
  )
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await page.getByLabel("지역 선택").selectOption({ index: 1 })
  const card = page.locator("[data-pilot-place-id]").first()
  await expect(card).toContainText("브랜드 공통 메뉴 · 지점별 판매 확인 필요")
  await card.click()
  await expect(page.getByRole("region", { name: "메뉴", exact: true })).toContainText(
    "지점별 판매 확인 필요",
  )
  await expect(page.getByRole("img", { name: "브랜드 메뉴" })).toHaveCount(0)
  await expect(page.getByRole("link", { name: /네이버 길찾기/ })).toBeVisible()
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
    return url.pathname === "/api/places" && url.searchParams.get("mode") === "places"
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
  await expect(page.getByLabel("검색 결과 수")).toHaveText("0곳 · 0곳 표시")
  release?.()
  await oldDelivery
  await expect(page.locator("[data-pilot-place-id]")).toHaveCount(0)
  await expect(page.getByRole("searchbox")).toHaveValue("newer")
})

test("regional fallback failure retains a retry action", async ({ page }) => {
  let failed = true
  await page.route("**/api/places?**", async (route) => {
    if (failed && new URL(route.request().url()).searchParams.get("mode") === "regions")
      return route.fulfill({ status: 503, json: { error: "catalog_unavailable", retry: true } })
    return route.continue()
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await expect(page.getByRole("button", { name: "메뉴 다시 불러오기" })).toBeVisible()
  failed = false
  await page.getByRole("button", { name: "메뉴 다시 불러오기" }).click()
  await expect(page.getByLabel("지역 선택").locator("option")).not.toHaveCount(1)
})
