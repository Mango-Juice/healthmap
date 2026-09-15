import {
  assertPrivateTransport,
  recordAnalyticsTransport,
  waitForEvent,
} from "./analytics-transport"
import { expect, firstVisitTest as test } from "./map-test"

for (const width of [375, 1280]) {
  test(`analytics consent is reachable and controls collection at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 800 })
    const transport = await recordAnalyticsTransport(page)
    await page.goto("/")
    await expect(page.locator("[data-food-map-place-id]").first()).toBeAttached()
    const search = page.getByRole("searchbox", { name: "가게나 메뉴 검색" })
    await search.fill("샐러드")
    await expect(page.getByLabel("검색 결과 수")).not.toHaveText("찾는 중")
    expect(transport.rawRequests).toHaveLength(0)

    const banner = page.getByRole("region", { name: "익명 이용 통계" })
    await expect(banner).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`analytics-banner-${width}.png`) })
    const settings = page.getByRole("button", { name: "분석 설정", exact: true })
    await banner.getByRole("button", { name: "허용", exact: true }).click()
    await expect(banner).not.toBeVisible()
    await expect(settings).toBeFocused()
    await waitForEvent(transport.events, "map_viewed", { source: "direct" })
    expect(transport.events.map(({ event }) => event)).toEqual(["map_viewed"])
    await settings.click()
    const dialog = page.getByRole("dialog", { name: "분석 설정" })
    const toggle = dialog.getByRole("switch", { name: "분석 데이터 수집 설정" })
    await expect(toggle).toBeChecked()
    await expect(toggle).toBeEnabled()
    await expect(dialog).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`analytics-settings-${width}.png`) })
    // Consent starts with the current map view, without replaying the earlier search.
    expect(transport.events.map(({ event }) => event)).toEqual(["map_viewed"])
    await page.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible()
    await expect(settings).toBeFocused()

    await search.fill("무지개 한그릇 연구소")
    await expect(page.getByLabel("검색 결과 수")).toHaveText("1곳 중 1곳")
    await waitForEvent(transport.events, "search_used", { result_count_bucket: "1_5" })
    await page.reload()
    await expect(page.locator("[data-food-map-place-id]").first()).toBeAttached()
    await expect(banner).not.toBeVisible()
    await expect
      .poll(() => transport.events.filter(({ event }) => event === "map_viewed").length)
      .toBe(2)

    await settings.click()
    await expect(toggle).toBeChecked()
    await toggle.click()
    await expect(toggle).not.toBeChecked()
    await dialog.getByRole("button", { name: "분석 설정 닫기" }).click()
    await expect(settings).toBeFocused()
    const countAfterOptOut = transport.events.length
    await search.fill("무지개 한그릇 연구소")
    await expect(page.getByLabel("검색 결과 수")).toHaveText("1곳 중 1곳")
    expect(transport.events).toHaveLength(countAfterOptOut)
    await page.reload()
    await expect(page.locator("[data-food-map-place-id]").first()).toBeAttached()
    await expect(banner).not.toBeVisible()
    expect(transport.events).toHaveLength(countAfterOptOut)
    await settings.click()
    await expect(toggle).not.toBeChecked()
    assertPrivateTransport(transport.events, transport.rawRequests)
  })
}

test("refusing the first visit banner persists and can later be changed in settings", async ({
  page,
}) => {
  const transport = await recordAnalyticsTransport(page)
  await page.goto("/")
  const banner = page.getByRole("region", { name: "익명 이용 통계" })
  await banner.getByRole("button", { name: "거부", exact: true }).click()
  await expect(banner).not.toBeVisible()
  await page.reload()
  await expect(page.locator("[data-food-map-place-id]").first()).toBeAttached()
  await expect(banner).not.toBeVisible()
  expect(transport.rawRequests).toHaveLength(0)
  await page.getByRole("button", { name: "분석 설정", exact: true }).click()
  const toggle = page.getByRole("switch", { name: "분석 데이터 수집 설정" })
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await waitForEvent(transport.events, "map_viewed", { source: "direct" })
  await expect(toggle).toBeChecked()
})

test("ignoring the banner or reading its details does not grant consent", async ({ page }) => {
  const transport = await recordAnalyticsTransport(page)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 188, height: 400 })
  await page.goto("/")
  const banner = page.getByRole("region", { name: "익명 이용 통계" })
  await expect(banner).toBeVisible()
  expect(await banner.evaluate((element) => getComputedStyle(element).animationName)).toBe("none")
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(188)
  await banner.getByRole("button", { name: "자세히", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "분석 설정" })
  await expect(dialog.getByRole("switch")).not.toBeChecked()
  await page.keyboard.press("Escape")
  await expect(banner.getByRole("button", { name: "자세히", exact: true })).toBeFocused()
  await page.reload()
  await expect(banner).toBeVisible()
  expect(transport.rawRequests).toHaveLength(0)
})

test("blocked storage keeps the first visit banner visible after either choice", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("blocked", "SecurityError")
    }
  })
  const transport = await recordAnalyticsTransport(page)
  await page.goto("/")
  const banner = page.getByRole("region", { name: "익명 이용 통계" })
  for (const name of ["허용", "거부"]) {
    await banner.getByRole("button", { name, exact: true }).click()
    await expect(banner.getByRole("alert")).toContainText("선택을 저장하지 못했어요")
    await expect(banner).toBeVisible()
  }
  expect(transport.rawRequests).toHaveLength(0)
})

test("blocked storage reports consent save failure and keeps collection disabled", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("blocked", "SecurityError")
    }
  })
  const transport = await recordAnalyticsTransport(page)
  await page.goto("/")
  await expect(page.locator("[data-food-map-place-id]").first()).toBeAttached()
  await page.getByRole("button", { name: "분석 설정", exact: true }).click()
  const toggle = page.getByRole("switch", { name: "분석 데이터 수집 설정" })
  await toggle.click()
  await expect(toggle).not.toBeChecked()
  await expect(page.getByRole("dialog", { name: "분석 설정" }).getByRole("alert")).toContainText(
    "설정을 저장하지 못했어요",
  )
  expect(transport.rawRequests).toHaveLength(0)
})

test("closing analytics settings preserves the open place and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await recordAnalyticsTransport(page)
  await page.goto("/")
  await page.locator("[data-food-map-place-id]").first().click()
  const placeBack = page.getByRole("button", { name: "장소에서 돌아가기" })
  await expect(placeBack).toBeVisible()
  const settings = page.getByRole("button", { name: "분석 설정", exact: true })
  await settings.click()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "분석 설정" })).not.toBeVisible()
  await expect(settings).toBeFocused()
  await expect(placeBack).toBeVisible()
})
