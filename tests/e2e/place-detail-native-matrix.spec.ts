import { mkdir, writeFile } from "node:fs/promises"
import { expect, test } from "./map-test"

test.describe.configure({ retries: 0 })
test.use({ hasTouch: true })

test.beforeAll(async () => {
  await mkdir(".omo/evidence/task-7/fix-r14", { recursive: true })
  await mkdir(".omo/evidence/task-7/fix-r9", { recursive: true })
})

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException("blocked")) },
    })
  })
})

test("native place-detail matrix covers filters, touch, scroll, history, share, motion, and rapid close", async ({
  page,
}) => {
  const nativeMatrix: Array<{
    readonly initialFilters: unknown
    readonly openPaneFilterHit: boolean | null
    readonly viewport: string
  }> = []
  const viewports = [
    { width: 375, height: 812, name: "375x812" },
    { width: 768, height: 1024, name: "768x1024" },
    { width: 1280, height: 800, name: "1280x800" },
  ] as const
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto("/")
    const rail = page.locator("fieldset")
    const filters = rail.getByRole("button")
    await expect(filters).toHaveCount(5)
    const filterMetrics = await filters.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect()
        const target = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )
        return {
          top: rect.top,
          width: rect.width,
          height: rect.height,
          hit: target === element || element.contains(target),
          icon: element.querySelector("svg")?.getBoundingClientRect().toJSON() ?? null,
        }
      }),
    )
    expect(
      filterMetrics.every(({ width, height, hit }) => width >= 44 && height >= 44 && hit),
    ).toBe(true)
    const iconsAreVisible = filterMetrics.every(({ icon }) => {
      if (icon === null || typeof icon !== "object") return false
      return "width" in icon && "height" in icon && icon.width >= 16 && icon.height >= 16
    })
    expect(iconsAreVisible).toBe(true)
    if (viewport.width === 375) {
      expect(new Set(filterMetrics.map(({ top }) => Math.round(top))).size).toBe(1)
    }
    for (let index = 0; index < 5; index += 1) await filters.nth(index).click()
    await filters.nth(0).click()
    await page.getByRole("button", { name: /새싹 네모식당/ }).tap()
    await expect(
      page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
    ).toBeVisible()
    let openPaneFilterHit: boolean | null = null
    if (viewport.width === 768) {
      openPaneFilterHit = await filters.nth(4).evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const target = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )
        return target === element || element.contains(target)
      })
      expect(openPaneFilterHit).toBe(true)
    }
    nativeMatrix.push({
      initialFilters: filterMetrics,
      openPaneFilterHit,
      viewport: viewport.name,
    })
    await page.screenshot({
      path: `.omo/evidence/task-7/fix-r14/native-${viewport.name}-open.png`,
      fullPage: false,
    })

    const body = page.getByTestId("place-detail-body")
    await body.hover()
    const bodyOverflow = await body.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    )
    if (bodyOverflow) {
      await page.mouse.wheel(0, 520)
      await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    }
    const activeBeforeTabs = await page.evaluate(
      () =>
        document.activeElement?.closest("[data-detail-phase]:not([data-testid='map-stage'])") !==
        null,
    )
    await page.keyboard.press("Tab")
    const activeAfterTab = await page.evaluate(
      () =>
        document.activeElement?.closest("[data-detail-phase]:not([data-testid='map-stage'])") !==
        null,
    )
    await page.keyboard.press("Shift+Tab")
    const activeAfterReverseTab = await page.evaluate(
      () =>
        document.activeElement?.closest("[data-detail-phase]:not([data-testid='map-stage'])") !==
        null,
    )
    expect(activeBeforeTabs).toBe(true)
    expect(activeAfterTab).toBe(true)
    expect(activeAfterReverseTab).toBe(viewport.width === 375)
    await page.getByRole("button", { name: "공유", exact: true }).tap()
    await expect(page.getByLabel("공유 URL")).toBeVisible()
    await page.getByRole("button", { name: "URL 선택" }).tap()
    await expect(page.getByText("공유 URL을 선택했습니다.")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("place-detail")).toHaveCount(0)
    await expect(page.locator("fieldset button[aria-pressed='true']")).toBeFocused()

    await page.getByRole("button", { name: /새싹 네모식당/ }).tap()
    await expect(
      page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
    ).toBeVisible()
    await page.goBack()
    await expect(page.getByTestId("place-detail")).toHaveCount(0)
    await expect(page.locator("fieldset button[aria-pressed='true']")).toBeFocused()

    if (viewport.width === 375) {
      for (let cycle = 0; cycle < 5; cycle += 1) {
        await page.getByRole("button", { name: /새싹 네모식당/ }).tap()
        await expect(
          page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
        ).toBeVisible()
        await page.getByRole("button", { name: "상세 닫기" }).tap()
        await expect(page.getByTestId("place-detail")).toHaveCount(0)
        await expect(page.locator("fieldset button[aria-pressed='true']")).toBeFocused()
      }
      await page.emulateMedia({ reducedMotion: "reduce" })
      await page.getByRole("button", { name: /새싹 네모식당/ }).tap()
      const reduced = await page
        .locator("[data-detail-phase]:not([data-testid='map-stage'])")
        .evaluate((element) => ({
          phase: element.getAttribute("data-detail-phase"),
          duration: getComputedStyle(element).transitionDuration,
        }))
      expect(["opening", "open"]).toContain(reduced.phase)
      expect(["0s", "1e-05s"]).toContain(reduced.duration)
      await page.getByRole("button", { name: "상세 닫기" }).tap()
      await expect(page.getByTestId("place-detail")).toHaveCount(0)
    }
  }
  await writeFile(
    ".omo/evidence/task-7/fix-r14/native-matrix.json",
    JSON.stringify({ viewports: nativeMatrix }, null, 2),
  )
})
