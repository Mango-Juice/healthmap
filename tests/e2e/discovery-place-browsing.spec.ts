import type { APIRequestContext, Page } from "@playwright/test"
import {
  DiscoveryDetailResponseSchema,
  DiscoveryPlacesResponseSchema,
} from "../../lib/discovery/dto"
import { expect, test } from "./map-test"
import { installDiscoveryStartGeolocation } from "./test-geolocation"

test.beforeEach(async ({ page }) => {
  await installDiscoveryStartGeolocation(page)
})

const installMenuScenario = async (
  page: Page,
  request: APIRequestContext,
  menuCount: number,
): Promise<void> => {
  const source = DiscoveryPlacesResponseSchema.parse(
    await (await request.get("/api/places?mode=places&limit=50")).json(),
  )
  const original = source.results[0]
  const menu = original?.menus[0]
  if (original === undefined || menu === undefined)
    throw new Error("Synthetic source menu is unavailable")
  const menus = Array.from({ length: menuCount }, (_, index) => ({
    ...menu,
    id: `10000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`,
    name: `검증 메뉴 ${index + 1}`,
  }))
  const result = { ...original, matchingMenuIds: menus.map((entry) => entry.id), menus }
  const results = [result, ...source.results.slice(1)]
  const places = DiscoveryPlacesResponseSchema.parse({
    ...source,
    nextCursor: null,
    results,
    total: results.length,
  })
  const detail = DiscoveryDetailResponseSchema.parse({
    catalogVersion: places.catalogVersion,
    menus,
    place: result.place,
  })
  await page.route("**/api/places?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") === "places")
      await route.fulfill({ json: places })
    else await route.continue()
  })
  await page.route("**/api/places/*", (route) => route.fulfill({ json: detail }))
}

test("results restore their exact reading position and detail actions precede long menus", async ({
  page,
  request,
}, testInfo) => {
  await installMenuScenario(page, request, 5)
  await page.setViewportSize({ width: 375, height: 640 })
  await page.goto("/")
  await page.getByRole("button", { name: "검색 결과 펼치기", exact: true }).click()
  const scrollFixture = await page.addStyleTag({
    content:
      "section[aria-label='건강식 검색 결과'] [class*='scrollBody'] { block-size: 120px !important; max-block-size: 120px !important; min-block-size: 0 !important; overflow-y: auto !important; }",
  })

  const listBody = page.locator("section[aria-label='건강식 검색 결과'] [class*='scrollBody']")
  await listBody.evaluate((element) => {
    element.scrollTop = Math.min(40, element.scrollHeight - element.clientHeight)
  })
  const result = page.locator("[data-food-map-place-id]").first()
  await result.scrollIntoViewIfNeeded()
  const savedScroll = await listBody.evaluate((element) => element.scrollTop)
  expect(savedScroll).toBeGreaterThan(0)
  const placeId = await result.getAttribute("data-food-map-place-id")
  if (placeId === null) throw new Error("place ID missing")
  await result.click()
  await page.getByRole("button", { name: "메뉴 펼치기", exact: true }).click()

  const actions = page.locator("[class*='visitActions']")
  const menus = page.locator("[class*='menus'] h3").first()
  await expect(actions).toBeVisible()
  await expect(menus).toBeVisible()
  const matchingSection = page.locator("[aria-label='조건에 맞는 메뉴']")
  await expect(matchingSection.locator("li")).toHaveCount(3)
  const menuExpansion = matchingSection.getByRole("button", { name: /메뉴 \d+개 더 보기/ })
  await expect(menuExpansion).toBeVisible()
  await menuExpansion.click()
  expect(await matchingSection.locator("li").count()).toBeGreaterThan(3)
  await page.screenshot({ path: testInfo.outputPath("detail-actions-375x640.png") })
  expect(
    await actions.evaluate((element) => {
      const menuSection = document.querySelector("[class*='menus']")
      if (menuSection === null) return 0
      return element.compareDocumentPosition(menuSection) & Node.DOCUMENT_POSITION_FOLLOWING
    }),
  ).toBeTruthy()

  await page.keyboard.press("Escape")
  const restored = page.locator(`[data-food-map-place-id="${placeId}"]`)
  await expect(restored).toBeVisible()
  await expect(restored).toBeFocused()
  await expect.poll(() => listBody.evaluate((element) => element.scrollTop)).toBe(savedScroll)

  await page.setViewportSize({ width: 1280, height: 800 })
  await restored.click()
  await page.getByRole("button", { name: "장소에서 돌아가기", exact: true }).click()
  await expect(restored).toBeVisible()
  await expect(restored).toBeFocused()
  await expect.poll(() => listBody.evaluate((element) => element.scrollTop)).toBe(savedScroll)

  await page.setViewportSize({ width: 375, height: 640 })
  await restored.click()
  await page.getByRole("button", { name: "장소 닫기", exact: true }).click()
  await expect(restored).toBeVisible()
  await expect(restored).toBeFocused()
  await expect.poll(() => listBody.evaluate((element) => element.scrollTop)).toBe(savedScroll)
  await scrollFixture.evaluate((element) => element.parentNode?.removeChild(element))
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.screenshot({ path: testInfo.outputPath("results-768x1024.png") })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.screenshot({ path: testInfo.outputPath("results-1280x800.png") })
})

test("one-menu detail at 200 percent keeps actions visible without an unnecessary expander or image", async ({
  page,
  request,
}, testInfo) => {
  await installMenuScenario(page, request, 1)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 2, name: "검색 결과" })).toBeVisible()
  await page.evaluate(() => {
    document.documentElement.style.zoom = "200%"
  })
  const result = page
    .locator("[data-food-map-place-id]")
    .filter({ hasNot: page.getByText(/외 \d+가지/) })
    .first()
  await expect(result).toBeVisible()
  const label = await result.getAttribute("aria-label")
  if (label === null) throw new Error("single matching-menu result label missing")
  const placeName = label.replace(" 자세히 보기", "")
  await result.click()

  await expect(page.getByRole("heading", { level: 2, name: placeName })).toBeVisible()
  await expect(page.getByRole("link", { name: "장소 정보 보기", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: `${placeName} 길찾기`, exact: true })).toBeVisible()
  await expect(
    page.locator("[aria-label='조건에 맞는 메뉴']").getByRole("button", { name: /더 보기/ }),
  ).toHaveCount(0)
  await expect(page.locator("figure img")).toHaveCount(0)
  const reflow = await page
    .getByRole("heading", { level: 2, name: placeName })
    .evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
  expect(reflow.scrollWidth).toBeLessThanOrEqual(reflow.clientWidth)
  await page.screenshot({ path: testInfo.outputPath("one-menu-200-percent-1280x800.png") })
})

test("marker-origin Escape keeps the result drawer collapsed and returns focus to the marker", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const marker = page
    .getByTestId("food-map-naver-map")
    .getByRole("button", { name: "구름 도시락 공방" })
  await expect(marker).toBeAttached()
  await marker.focus()
  await expect(marker).toBeFocused()
  await marker.click()
  await page.keyboard.press("Escape")

  await expect(page.getByRole("button", { name: "검색 결과 펼치기", exact: true })).toBeVisible()
  await expect(marker).toBeFocused()
})
