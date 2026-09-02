import { expect, test } from "./map-test"

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
})

test.describe.configure({ retries: 0 })

test("place detail opening exposes start, in-flight, and settled states", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await expect(page.getByText("NAVER 지도 연결됨")).toBeVisible()
  const surface = page.locator("[data-detail-phase]:not([data-testid='map-stage'])")
  const start = await page.evaluate(
    () =>
      new Promise<{ phase: string | null; transform: string; opacity: string }>((resolve) => {
        const read = (): void => {
          const element = document.querySelector<HTMLElement>(
            "[data-detail-phase]:not([data-testid='map-stage'])",
          )
          if (element === null) return
          observer.disconnect()
          resolve({
            phase: element.getAttribute("data-detail-phase"),
            transform: getComputedStyle(element).transform,
            opacity: getComputedStyle(element).opacity,
          })
        }
        const observer = new MutationObserver(read)
        observer.observe(document.body, { childList: true, subtree: true })
        document.querySelector<HTMLButtonElement>('[aria-label^="새싹 네모식당"]')?.click()
        read()
      }),
  )
  await page.waitForTimeout(120)
  const middle = await surface.evaluate((element) => ({
    phase: element.getAttribute("data-detail-phase"),
    transform: getComputedStyle(element).transform,
    opacity: getComputedStyle(element).opacity,
  }))
  await page.waitForTimeout(180)
  const end = await surface.evaluate((element) => ({
    phase: element.getAttribute("data-detail-phase"),
    transform: getComputedStyle(element).transform,
    opacity: getComputedStyle(element).opacity,
  }))
  expect(start.phase).toBe("opening")
  expect(start.transform).not.toBe("none")
  expect(start.opacity).toBe("0")
  expect(middle.transform).not.toBe(start.transform)
  expect(middle.opacity).not.toBe(start.opacity)
  expect(end.phase).toBe("open")
  expect(end.transform === "none" || end.transform === "matrix(1, 0, 0, 1, 0, 0)").toBe(true)
  expect(end.opacity).toBe("1")
})
test("NAVER map host remains bounded with five native markers", async ({ page }) => {
  await page.goto("/")
  const map = page.getByTestId("map-stage")
  const naverMap = page.getByTestId("naver-map")
  await expect(naverMap).toBeVisible()
  await expect(naverMap.locator("canvas[data-test-naver-map]")).toBeVisible()
  await expect(map.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
  const bounded = await naverMap.evaluate((element) => {
    const mapRect = element.parentElement?.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    return (
      mapRect !== undefined &&
      rect.left >= mapRect.left &&
      rect.right <= mapRect.right &&
      rect.top >= mapRect.top &&
      rect.bottom <= mapRect.bottom
    )
  })
  expect(bounded).toBe(true)
})
test("NAVER map composition preserves the detail anatomy", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await expect(page.getByTestId("naver-map")).toBeVisible()
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  const detail = page.getByTestId("place-detail")
  await expect(detail.locator("[data-detail-summary]")).toBeVisible()
  await expect(detail.locator("[data-detail-meta]")).toHaveCount(2)
  await expect(detail.locator("[data-detail-menu]")).toBeVisible()
})
test("desktop detail is complementary beside the NAVER map", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto("/")
  const map = page.getByTestId("map-stage")
  await expect(page.getByTestId("naver-map")).toBeVisible()
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  await expect(page.getByRole("complementary", { name: "장소 상세" })).toBeVisible()
  const fifth = map.locator("fieldset button").nth(4)
  const hit = await fifth.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return target === element || element.contains(target)
  })
  expect(hit).toBe(true)
})
test("normal close stays mounted through the detail transition", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  await expect(page.getByTestId("place-detail")).toBeVisible()
  const transition = await page
    .locator("[data-detail-phase='open']:not([data-testid='map-stage'])")
    .evaluate((element) => getComputedStyle(element).transitionDuration)
  expect(transition).toContain("0.24")
  const startedAt = await page.evaluate(() => performance.now())
  await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
  await expect(
    page.locator("[data-detail-phase='closing']:not([data-testid='map-stage'])"),
  ).toBeVisible()
  await expect(page.getByTestId("place-detail")).toBeVisible()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  const elapsed = await page.evaluate((start) => performance.now() - start, startedAt)
  expect(elapsed).toBeGreaterThan(200)
})
test("close keeps the surface mounted until its native transition completes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  await page.waitForTimeout(350)
  await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
  const closing = await page
    .locator("[data-detail-phase]:not([data-testid='map-stage'])")
    .evaluate((element) => ({
      phase: element.getAttribute("data-detail-phase"),
      transform: getComputedStyle(element).transform,
      transition: getComputedStyle(element).transitionDuration,
    }))
  expect(closing.phase).toBe("closing")
  expect(closing.transform).not.toBe("none")
  expect(closing.transition).toContain("0.24")
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
})
test("desktop close completes the inline pane transition", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  await page.waitForTimeout(350)
  await page.keyboard.press("Escape")
  const closing = await page
    .locator("[data-detail-phase]:not([data-testid='map-stage'])")
    .evaluate((element) => ({
      phase: element.getAttribute("data-detail-phase"),
      transform: getComputedStyle(element).transform,
      transition: getComputedStyle(element).transitionDuration,
    }))
  expect(closing.phase).toBe("closing")
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
})
test("Back during opening and the first rapid mobile close complete deterministically", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto("/")
  const marker = page.getByTestId("naver-map").getByRole("button", { name: "새싹 네모식당" })
  await marker.click()
  await page.goBack()
  await page.waitForTimeout(350)
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(marker).toBeFocused()

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const mobileResultCard = page.getByRole("button", { name: "새싹 네모식당 상세 보기" })
  await mobileResultCard.click()
  await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
  await page.waitForTimeout(350)
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(mobileResultCard).toBeFocused()
})
test("captures fresh production viewport and motion evidence", async ({ page }, testInfo) => {
  const viewports = [
    { width: 375, height: 812, name: "375x812" },
    { width: 768, height: 1024, name: "768x1024" },
    { width: 1280, height: 800, name: "1280x800" },
  ] as const
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto("/")
    await page.screenshot({
      path: testInfo.outputPath(`final-${viewport.name}-map.png`),
    })
    await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
    await page.screenshot({
      path: testInfo.outputPath(`final-${viewport.name}-start.png`),
    })
    await page.waitForTimeout(120)
    await page.screenshot({
      path: testInfo.outputPath(`final-${viewport.name}-120ms.png`),
    })
    await page.waitForTimeout(200)
    await page.screenshot({
      path: testInfo.outputPath(`final-${viewport.name}-settled.png`),
    })
    await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
    await expect(page.getByTestId("place-detail")).toHaveCount(0)
  }
})
test("reduced motion removes the sheet delay and still restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  const resultCard = page.getByRole("button", { name: "새싹 네모식당 상세 보기" })
  await resultCard.click()
  const motion = await page
    .locator("[data-detail-phase]:not([data-testid='map-stage'])")
    .evaluate((element) => ({
      phase: element.getAttribute("data-detail-phase"),
      duration: getComputedStyle(element).transitionDuration,
      transform: getComputedStyle(element).transform,
    }))
  expect(motion.phase).toBe("open")
  expect(motion.duration === "1e-05s" || motion.duration.includes("0.01")).toBe(true)
  expect(motion.transform).toBe("none")
  await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(resultCard).toBeFocused()
})
