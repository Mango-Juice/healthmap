import { expect, test } from "./map-test"

const MAP_SHARE = "/?q=&tag=balanced&lat=37.501&lng=127.033&z=15"
const MAP_VIEW = "37.5010, 127.0330 · 확대 15"

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
})

test("desktop manual fallback supports native marker, share, select, close, Escape, and Back actions", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException("blocked")) },
    })
  })
  await page.goto(MAP_SHARE)
  await page.getByTestId("naver-map").getByRole("button", { name: "새싹 네모식당" }).click()
  await page.getByRole("button", { name: "공유", exact: true }).click()
  await expect(page.getByLabel("공유 URL")).toBeVisible()
  await page.getByRole("button", { name: "URL 선택" }).click()
  await expect(page.getByText("공유 URL을 선택했습니다.")).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath("manual-complete-1280x800.png"),
  })
  await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)

  await page.goto(MAP_SHARE)
  await page.getByTestId("naver-map").getByRole("button", { name: "새싹 네모식당" }).click()
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await page.goBack()
  await expect(page).toHaveURL(MAP_SHARE)
  await expect(page.getByTestId("map-view")).toHaveText(MAP_VIEW)
})
test("mobile detail is a contained dialog with an explicit recovery scroll and visible filter rail", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException("blocked")) },
    })
  })
  await page.goto("/")

  const rail = page.locator("fieldset")
  await expect
    .poll(() => rail.evaluate((element) => getComputedStyle(element).scrollbarWidth))
    .not.toBe("none")

  const marker = page.getByTestId("naver-map").getByRole("button", { name: "새싹 네모식당" })
  await page.getByRole("button", { name: /검색 결과 \d+곳 접기/ }).click()
  await marker.click()
  const dialog = page.getByRole("dialog", { name: "장소 상세" })
  const close = page.getByRole("button", { name: "검색 결과로 돌아가기" })
  await expect(dialog).toBeVisible()
  await expect(close).toBeVisible()
  await expect
    .poll(() =>
      close.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width >= 16 && rect.height >= 16
      }),
    )
    .toBe(true)

  await close.focus()
  await page.keyboard.press("Shift+Tab")
  await expect(page.getByRole("button", { name: "지도 공유" })).toBeFocused()

  await page.getByRole("button", { name: "공유", exact: true }).click()
  const body = page.getByTestId("place-detail-body")
  await expect(page.getByLabel("공유 URL")).toBeVisible()
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole("button", { name: "URL 선택" })).toBeVisible()

  await close.click()
  await expect(marker).toBeFocused()
})
