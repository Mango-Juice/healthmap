import type { APIRequestContext, Page } from "@playwright/test"
import { PilotDetailResponseSchema, PilotPlacesResponseSchema } from "../../lib/pilot/dto"
import { expect, serverTest as test } from "./map-test"

const installSubwayScenario = async (page: Page, request: APIRequestContext): Promise<void> => {
  const source = PilotPlacesResponseSchema.parse(
    await (await request.get("/api/places?mode=places&limit=1")).json(),
  )
  const original = source.results[0]
  if (original === undefined) throw new TypeError("Test source place is unavailable")
  const places = PilotPlacesResponseSchema.parse({
    ...source,
    nextCursor: null,
    results: [
      {
        matchingMenuIds: [],
        menus: [],
        place: {
          ...original.place,
          brandId: "subway",
          listingKind: "store_only",
          media: [],
          name: "서브웨이 테스트점",
          naverPlaceUrl: null,
          officialStoreUrl: "https://www.subway.co.kr/storeDetail?franchiseNo=1",
          slug: "test-subway-store",
          storeDescription: "서브웨이 · 샌드위치·샐러드 매장",
        },
      },
    ],
    total: 1,
  })
  const result = places.results[0]
  if (result === undefined) throw new TypeError("Test Subway place is unavailable")
  const detail = PilotDetailResponseSchema.parse({
    catalogVersion: places.catalogVersion,
    menus: result.menus,
    place: result.place,
  })
  await page.route("**/api/places?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") !== "places")
      return route.continue()
    await route.fulfill({ contentType: "application/json", json: places })
  })
  await page.route("**/api/places/*", (route) => route.fulfill({ json: detail }))
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 812 },
] as const) {
  test(`opens an honest Subway store detail on ${viewport.name}`, async ({
    page,
    request,
  }, testInfo) => {
    // Given a schema-parsed store-only response rendered in the root FoodMap.
    await installSubwayScenario(page, request)
    expect((await request.get("/")).ok()).toBe(true)
    await page.setViewportSize(viewport)
    await page.goto("/")
    const search = page.getByRole("searchbox", { name: "가게나 메뉴 검색" })

    // When a visitor searches Subway and opens its first bounded result.
    await search.fill("서브웨이")
    const marker = page
      .locator('button[data-test-naver-marker="true"][aria-label^="서브웨이 "]')
      .first()
    const result = page.getByRole("button", { name: /서브웨이 .+ 자세히 보기/u }).first()
    await expect(marker).toBeVisible()
    await expect(marker.locator("img[data-test-marker-icon]")).toHaveAttribute(
      "src",
      "/markers/pilot-salad_poke.svg",
    )
    await page.screenshot({
      path: testInfo.outputPath(`subway-marker-normal-${viewport.width}x${viewport.height}.png`),
    })
    await expect(result).toBeVisible()
    await result.click()
    await expect(marker.locator("img[data-test-marker-icon]")).toHaveAttribute(
      "src",
      "/markers/pilot-salad_poke-selected.svg",
    )
    // Then the detail exposes store facts and navigation without a menu or health claim.
    const storeSummary = page.locator("p").filter({ hasText: "서브웨이 · 샌드위치·샐러드 매장" })
    await expect(storeSummary).toContainText("메뉴 정보는 아직 확인되지 않았어요.")
    await expect(page.getByRole("link", { name: "장소 정보 보기" })).toHaveAttribute(
      "href",
      /^https:\/\/(?:www\.)?subway\.co\.kr\/storeDetail\?franchiseNo=\d+$/u,
    )
    await expect(page.getByRole("link", { name: /길찾기/u })).toHaveAttribute(
      "href",
      /^https:\/\/map\.naver\.com\/index\.nhn\?/u,
    )
    await expect(page.getByText("태그는 음식과 메뉴에서 확인된 특징이며")).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath(`subway-marker-selected-${viewport.width}x${viewport.height}.png`),
    })

    // When the visitor returns and applies a health-category filter.
    await page
      .getByRole("button", {
        name: viewport.width < 900 ? "장소 닫기" : "장소에서 돌아가기",
      })
      .click()
    await page.getByRole("button", { name: "샐러드·포케 필터" }).click()
    const drawerToggle = page.getByTestId("pilot-drawer-handle").getByRole("button").first()
    if (viewport.width < 900 && (await drawerToggle.getAttribute("aria-expanded")) === "false")
      await drawerToggle.click()

    // Then the approved salad category includes Subway without menu facts.
    await expect(result).toBeVisible()
    await expect(marker.locator("img[data-test-marker-icon]")).toHaveAttribute(
      "src",
      "/markers/pilot-salad_poke.svg",
    )
    await page.screenshot({
      path: testInfo.outputPath(`subway-salad-results-${viewport.width}x${viewport.height}.png`),
    })
    await result.click()
    await expect(marker.locator("img[data-test-marker-icon]")).toHaveAttribute(
      "src",
      "/markers/pilot-salad_poke-selected.svg",
    )
    await expect(storeSummary).toContainText("메뉴 정보는 아직 확인되지 않았어요.")
    await page.screenshot({
      path: testInfo.outputPath(`subway-salad-detail-${viewport.width}x${viewport.height}.png`),
    })
  })
}
