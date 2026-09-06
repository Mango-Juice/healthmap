import { PilotPlacesResponseSchema } from "../../lib/pilot/dto"
import { expect, test } from "./map-test"
import { installPilotStartGeolocation } from "./test-geolocation"

test("the production root connects discovery, place actions, and suggestion context", async ({
  page,
}, testInfo) => {
  // Given an opted-out visitor and a small page size that exposes real pagination.
  const analyticsRequests: string[] = []
  const suggestionPosts: string[] = []
  await installPilotStartGeolocation(page)
  await page.addInitScript(() => {
    localStorage.setItem("healthmap.analytics.opt-out.v1", "true")
  })
  await page.route("**/e/**", async (route) => {
    analyticsRequests.push(route.request().url())
    await route.fulfill({ status: 200, body: "{}" })
  })
  await page.route("**/api/suggestions", async (route) => {
    if (route.request().method() === "POST") suggestionPosts.push(route.request().postData() ?? "")
    await route.continue()
  })
  await page.route("**/api/places?**", async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get("mode") !== "places") return route.continue()
    const upstreamUrl = new URL(url)
    upstreamUrl.searchParams.delete("cursor")
    upstreamUrl.searchParams.set("limit", "50")
    const response = await route.fetch({ url: upstreamUrl.toString() })
    const catalog = PilotPlacesResponseSchema.parse(await response.json())
    const paginated = url.searchParams.has("cursor")
      ? { ...catalog, nextCursor: null, results: catalog.results.slice(1, 2) }
      : { ...catalog, nextCursor: "release-page-2", results: catalog.results.slice(0, 1) }
    await route.fulfill({ contentType: "application/json", json: paginated })
  })
  await page.setViewportSize({ width: 1280, height: 800 })

  // When the visitor searches, expands globally ordered results, and opens one from the list.
  await page.goto("/")
  const search = page.getByRole("searchbox", { name: "가게나 메뉴 검색" })
  await search.fill("그릇")
  const firstResult = page.locator("[data-pilot-place-id]").first()
  await expect(firstResult).toBeVisible()
  const firstPlaceId = await firstResult.getAttribute("data-pilot-place-id")
  const firstLabel = await firstResult.getAttribute("aria-label")
  if (firstPlaceId === null || firstLabel === null) throw new TypeError("place identity missing")
  const totalText = await page.getByLabel("검색 결과 수").innerText()
  const totalMatch = /^(\d+)곳 중 1곳$/u.exec(totalText)
  if (totalMatch === null || Number(totalMatch[1]) < 2)
    throw new TypeError("search fixture must expose pagination")
  await page.getByRole("button", { name: "장소 더 보기" }).click()
  await expect(page.locator("[data-pilot-place-id]")).toHaveCount(2)
  await page.screenshot({ path: testInfo.outputPath("search-pagination-1280x800.png") })
  await firstResult.click()

  // Then external actions and proposal context are available without submitting anything.
  const placeName = firstLabel.replace(" 자세히 보기", "")
  await expect(page.getByRole("heading", { level: 2, name: placeName })).toBeVisible()
  await expect(page.getByRole("link", { name: "장소 정보 보기", exact: true })).toHaveAttribute(
    "href",
    /^https:\/\/map\.naver\.com\//u,
  )
  await expect(
    page.getByRole("link", { name: `${placeName} 길찾기`, exact: true }),
  ).toHaveAttribute("href", /^https:\/\/map\.naver\.com\//u)
  const suggestion = page.getByRole("link", { name: "바뀐 메뉴 알려주기" })
  await expect(suggestion).toHaveAttribute("href", `/suggest?placeId=${firstPlaceId}`)
  await page.screenshot({ path: testInfo.outputPath("detail-actions-1280x800.png") })
  await suggestion.click()
  await expect(page).toHaveURL(`/suggest?placeId=${firstPlaceId}`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.goBack()
  await search.fill("그릇")
  await expect(firstResult).toBeVisible()
  await firstResult.click()
  await expect(page.getByRole("heading", { level: 2, name: placeName })).toBeVisible()
  await page.getByRole("button", { name: "장소에서 돌아가기", exact: true }).click()
  await expect(firstResult).toBeFocused()

  // And list Close, marker Escape, and the proposal GET retain their invocation contracts.
  await page.setViewportSize({ width: 375, height: 812 })
  await firstResult.click()
  await page.getByRole("button", { name: "장소 닫기", exact: true }).click()
  await expect(firstResult).toBeFocused()
  await page.getByRole("button", { name: "검색 결과 접기", exact: true }).click()
  const marker = page.getByTestId("pilot-naver-map").getByRole("button", { name: placeName })
  await marker.click()
  await page.keyboard.press("Escape")
  await expect(marker).toBeFocused()
  expect(suggestionPosts).toHaveLength(0)
  expect(analyticsRequests).toHaveLength(0)
})
