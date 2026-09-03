import type { Route } from "@playwright/test"
import { PublicCatalogSnapshotSchema } from "../../lib/domain/catalog"
import { longKoreanTypedStress, typedLongKoreanStressCatalog } from "../fixtures/e2e-catalog"
import { measureTypedStressLayout } from "../fixtures/e2e-typed-stress-layout"
import { expect, test } from "./map-test"

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
})

test("renders long Korean text and an unbroken URL through the typed catalog boundary with one scroll owner", async ({
  context,
  page,
}, testInfo) => {
  await context.unroute("**/api/map-catalog")
  await context.route("**/api/map-catalog", async (route) => {
    await route.fulfill({ contentType: "application/json", json: typedLongKoreanStressCatalog })
  })
  await page.setViewportSize({ height: 812, width: 375 })
  await page.goto("/")
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/map-catalog" &&
      response.request().method() === "GET",
  )
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  const responseCatalog = PublicCatalogSnapshotSchema.parse(await (await responsePromise).json())
  expect(responseCatalog.catalogVersion).toBe(typedLongKoreanStressCatalog.catalogVersion)
  expect(
    responseCatalog.places.some(
      (place) =>
        place.address === longKoreanTypedStress.address &&
        place.name === longKoreanTypedStress.placeName,
    ),
  ).toBe(true)
  expect(
    responseCatalog.menus.some(
      (menu) =>
        menu.evidenceUrl === longKoreanTypedStress.evidenceUrl &&
        menu.name === longKoreanTypedStress.menuName,
    ),
  ).toBe(true)

  const detailButton = page.getByRole("button", {
    name: `${longKoreanTypedStress.placeName} 상세 보기`,
  })
  await expect(detailButton).toBeVisible()
  await detailButton.click()
  const detail = page.getByTestId("place-detail")
  const detailBody = page.getByTestId("place-detail-body")
  await expect(detail).toContainText(longKoreanTypedStress.placeName)
  await expect(detailBody).toContainText(longKoreanTypedStress.address)
  await expect(detailBody).toContainText(longKoreanTypedStress.menuName)
  const evidence = detailBody.locator("a").first()
  await expect(evidence).toHaveAttribute("href", longKoreanTypedStress.evidenceUrl)

  const metrics = await measureTypedStressLayout(page)
  expect(metrics).toEqual({ detailFits: true, documentFits: true, owners: ["place-detail-body"] })
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("long-korean-url-375x812.png"),
  })

  await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await detailButton.click()
  await expect(detailBody).toContainText(longKoreanTypedStress.menuName)
})

test("captures distinct catalog loading empty and error surfaces", async ({ page }, testInfo) => {
  const expectFeedbackAboveTray = async (): Promise<void> => {
    const separated = await page.evaluate(() => {
      const feedback = document.querySelector<HTMLElement>("[class*='catalogFeedback']")
      const tray = document.querySelector<HTMLElement>("[aria-label='검색 결과 패널']")
      if (feedback === null || tray === null) return false
      return feedback.getBoundingClientRect().bottom <= tray.getBoundingClientRect().top
    })
    expect(separated).toBe(true)
  }
  const requests: Route[] = []
  await page.route("**/api/map-catalog", async (route) => {
    requests.push(route)
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect.poll(() => requests.length).toBe(1)
  await expect(page.getByText("장소 데이터를 불러오는 중입니다.")).toBeVisible()
  await expectFeedbackAboveTray()
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())
  await page.screenshot({ path: testInfo.outputPath("loading-375x812.png") })

  await requests[0]?.fulfill({
    contentType: "application/json",
    body: '{"catalogVersion":"empty-visual","dataMode":"production","menus":[],"places":[]}',
  })
  await expect(page.getByText("표시할 장소가 없습니다.")).toBeVisible()
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())
  await page.screenshot({ path: testInfo.outputPath("empty-375x812.png") })

  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect.poll(() => requests.length).toBe(2)
  await requests[1]?.fulfill({ status: 503 })
  await expect(page.getByText("장소 데이터를 불러오지 못했습니다.")).toBeVisible()
  await expectFeedbackAboveTray()
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())
  await page.screenshot({ path: testInfo.outputPath("error-375x812.png") })
})

test("captures keyboard focus and reduced-motion detail", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())
  await page.keyboard.press("Tab")
  await expect(page.getByRole("button", { name: "장소 새로고침" })).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath("keyboard-focus-375x812.png") })
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  await expect(
    page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
  ).toHaveAttribute("data-detail-motion", "settled")
  await page.screenshot({ path: testInfo.outputPath("reduced-motion-detail-375x812.png") })
})
