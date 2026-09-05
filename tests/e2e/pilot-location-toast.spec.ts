import { expect, test } from "./map-test"

test("Given failed GPS, When location is retried, Then each failure uses the bottom toast and expires", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
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
  await page.goto("/")
  const locate = page.getByRole("button", { name: "내 위치", exact: true })
  const notice = page.getByText("위치를 확인하지 못했어요.", { exact: true })
  await expect(locate).toBeEnabled()
  await expect(notice).toBeHidden()

  for (const attempt of ["denied", "unsupported"] as const) {
    if (attempt === "unsupported") {
      await page.evaluate(() => {
        Object.defineProperty(navigator, "geolocation", { value: undefined })
      })
    }
    await locate.click()
    await expect(notice).toBeVisible()
    const bounds = await notice.boundingBox()
    expect.soft(bounds?.y).toBeGreaterThan(812 / 2)
    await page.screenshot({ path: testInfo.outputPath(`${attempt}-visible-375x812.png`) })
    await expect(notice).toBeHidden({ timeout: 4_000 })
    await page.screenshot({ path: testInfo.outputPath(`${attempt}-expired-375x812.png`) })
    await expect(locate).toBeEnabled()
    await expect(page.getByTestId("pilot-map-stage")).toHaveAttribute("data-adapter-state", "ready")
  }

  await page.getByRole("searchbox").fill("존재하지않는가게gps회귀검증")
  await expect(page.getByTestId("pilot-empty-toast")).toBeVisible()
  await expect(notice).toBeHidden()
})
