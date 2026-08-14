import { mkdir } from "node:fs/promises"
import { expect, test } from "@playwright/test"

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
})

test.describe.configure({ retries: 0 })

test.beforeAll(async () => {
  await mkdir(".omo/evidence/task-7/fix-r11", { recursive: true })
  await mkdir(".omo/evidence/task-7/fix-r9", { recursive: true })
  await mkdir(".omo/evidence/task-7/fix-r10", { recursive: true })
})

test("mobile manual share owns native wheel scroll while the sheet and heading stay fixed", async ({
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
  await page.getByRole("button", { name: /새싹 네모식당/ }).click()
  const detail = page.getByTestId("place-detail")
  await expect(page.locator("[data-detail-phase='open']")).toBeVisible()
  await page.getByRole("button", { name: "공유", exact: true }).click()
  await expect(page.getByLabel("공유 URL")).toBeVisible()

  const body = page.getByTestId("place-detail-body")
  const before = await body.evaluate((element) => {
    const detailElement = element.closest("[data-testid='place-detail']")?.parentElement
    const rect = detailElement?.getBoundingClientRect()
    return {
      bodyScrollTop: element.scrollTop,
      bodyScrollHeight: element.scrollHeight,
      bodyClientHeight: element.clientHeight,
      detailTop: rect?.top ?? -1,
      headingTop: document.querySelector("#place-detail-title")?.getBoundingClientRect().top ?? -1,
    }
  })
  expect(before.bodyScrollHeight).toBeGreaterThan(before.bodyClientHeight)
  await body.hover()
  await page.mouse.wheel(0, 600)
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  const after = await body.evaluate((element) => {
    const detailElement = element.closest("[data-testid='place-detail']")?.parentElement
    const rect = detailElement?.getBoundingClientRect()
    return {
      detailTop: rect?.top ?? -1,
      headingTop: document.querySelector("#place-detail-title")?.getBoundingClientRect().top ?? -1,
    }
  })
  expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect(after.detailTop).toBe(before.detailTop)
  expect(after.headingTop).toBe(before.headingTop)
  await expect(detail).toBeVisible()
})

test("production shell resolves consumed tokens and shows a fully visible five-control rail", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const tokens = [
    "--hm-surface",
    "--hm-surface-subtle",
    "--hm-error",
    "--hm-error-wash",
    "--hm-icon-sm",
    "--hm-icon-md",
    "--hm-icon-lg",
    "--hm-motion-standard",
    "--hm-motion-reduced",
    "--hm-ease-standard",
    "--hm-ease-out",
    "--hm-type-body",
    "--hm-type-subheading",
    "--hm-leading-body",
    "--hm-weight-action",
    "--hm-disabled-opacity",
    "--hm-border-width",
    "--hm-shadow-detail",
    "--hm-layer-detail",
    "--hm-visually-hidden-size",
    "--hm-skeleton-block",
    "--hm-skeleton-line-wide",
    "--hm-skeleton-line-mid",
    "--hm-skeleton-line-short",
    "--hm-skeleton-action-wide",
    "--hm-empty-block",
    "--hm-empty-copy-measure",
    "--hm-empty-glyph",
    "--hm-skeleton-opacity-low",
    "--hm-skeleton-opacity-high",
    "--hm-motion-spinner",
    "--hm-motion-skeleton",
    "--hm-spinner-turn",
  ] as const
  const tokenValues = await page
    .getByRole("region", { name: "건강식 지도" })
    .evaluate((element, names) => {
      const styles = getComputedStyle(element)
      return Object.fromEntries(names.map((name) => [name, styles.getPropertyValue(name).trim()]))
    }, tokens)
  expect(Object.values(tokenValues).every((value) => value.length > 0)).toBe(true)
  const rail = page.locator("fieldset")
  const railBox = await rail.boundingBox()
  expect(railBox).not.toBeNull()
  const controls = rail.getByRole("button")
  await expect(controls).toHaveCount(5)
  const controlMetrics = await controls.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
      }
    }),
  )
  expect(controlMetrics.every((metric) => metric.width >= 44)).toBe(true)
  expect(controlMetrics.every((metric) => metric.left >= (railBox?.x ?? 0))).toBe(true)
  expect(
    controlMetrics.every((metric) => metric.right <= (railBox?.x ?? 0) + (railBox?.width ?? 0)),
  ).toBe(true)
  const leafSizes = await page.locator("fieldset svg").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }),
  )
  expect(leafSizes.length).toBe(5)
  expect(leafSizes.every(({ width, height }) => width >= 16 && height >= 16)).toBe(true)
})

test("initial 375 balance filter receives the native click without status interception", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const balanced = page.getByRole("button", { name: "균형식 필터" })
  const hit = await balanced.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return {
      targetTag: target?.tagName ?? null,
      targetIsButton: target === element || element.contains(target),
    }
  })
  expect(hit.targetIsButton).toBe(true)
  await balanced.click()
  await expect(balanced).toHaveAttribute("aria-pressed", "true")
})

test("open 768 pane keeps the fifth filter natively hit-testable", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto("/")
  await page.screenshot({
    path: ".omo/evidence/task-7/fix-r10/baseline-768x1024-default.png",
  })
  await page.getByRole("button", { name: /새싹 네모식당/ }).click()
  await expect(page.locator("[data-detail-phase='open']")).toBeVisible()
  const fifth = page.getByRole("button", { name: "식물성 필터" })
  const hit = await fifth.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return {
      center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      filterRect: rect.toJSON(),
      targetId: target?.id ?? null,
      targetTag: target?.tagName ?? null,
      targetTestId: target?.closest("[data-testid]")?.getAttribute("data-testid") ?? null,
      targetIsFilter: target === element || element.contains(target),
    }
  })
  await page.screenshot({
    path: ".omo/evidence/task-7/fix-r10/baseline-768x1024-open.png",
  })
  expect(hit.targetIsFilter).toBe(true)
})

test("768 split-pane acceptance keeps every filter stable through opening and restore", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto("/")
  const map = page.getByTestId("map-stage")
  const rail = map.locator("fieldset")
  const filters = rail.getByRole("button")
  const capture = async () =>
    page.evaluate(() => {
      const mapElement = document.querySelector<HTMLElement>("[data-testid='map-stage']")
      const railElement = mapElement?.querySelector<HTMLElement>("fieldset")
      const pane = document.querySelector<HTMLElement>("[data-detail-phase]")
      const mapRect = mapElement?.querySelector("[data-field-guide-map]")?.getBoundingClientRect()
      const paneRect = pane?.getBoundingClientRect()
      const filters = [...document.querySelectorAll<HTMLElement>("fieldset button")].map(
        (element) => {
          const rect = element.getBoundingClientRect()
          const target = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          )
          return {
            center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
            visible:
              rect.left >= 0 &&
              rect.right <= innerWidth &&
              rect.top >= 0 &&
              rect.bottom <= innerHeight,
            nativeHit: target === element || element.contains(target),
            pressed: element.getAttribute("aria-pressed"),
          }
        },
      )
      return {
        mapScrollLeft: mapElement?.scrollLeft ?? -1,
        railScrollLeft: railElement?.scrollLeft ?? -1,
        mapRight: mapRect?.right ?? -1,
        paneLeft: paneRect?.left ?? innerWidth,
        paneRight: paneRect?.right ?? -1,
        filters,
      }
    })
  const closed = await capture()
  await expect(closed.mapScrollLeft).toBe(0)
  await page.getByRole("button", { name: /새싹 네모식당/ }).click()
  await page.waitForTimeout(20)
  const opening = await capture()
  await expect(
    page.locator("[data-detail-phase='opening'], [data-detail-phase='open']"),
  ).toBeVisible()
  await page.waitForTimeout(280)
  const settled = await capture()
  await page.screenshot({ path: ".omo/evidence/task-7/fix-r11/final-768-settled.png" })
  const states = [closed, opening, settled]
  for (const state of states) {
    expect(state.mapScrollLeft).toBe(0)
    expect(state.railScrollLeft).toBe(closed.railScrollLeft)
    expect(state.filters.every(({ visible, nativeHit }) => visible && nativeHit)).toBe(true)
  }
  expect(settled.paneLeft).toBeGreaterThanOrEqual(settled.mapRight)
  expect(settled.paneRight).toBeGreaterThan(settled.paneLeft)
  for (let index = 0; index < 5; index += 1) {
    await filters.nth(index).click()
    await expect(filters.nth(index)).toHaveAttribute("aria-pressed", "true")
    const afterFilter = await capture()
    expect(afterFilter.mapScrollLeft).toBe(0)
    expect(afterFilter.filters.every(({ visible, nativeHit }) => visible && nativeHit)).toBe(true)
  }
  await filters.nth(0).click()
  await expect(filters.nth(0)).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "상세 닫기" }).click()
  await page.waitForTimeout(300)
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  const restored = await capture()
  expect(restored.mapScrollLeft).toBe(0)
  expect(restored.filters.every(({ visible, nativeHit }) => visible && nativeHit)).toBe(true)
  await expect(page.getByRole("button", { name: /새싹 네모식당/ })).toBeFocused()
})

test("desktop title focus does not scroll its map ancestor", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto("/")
  const map = page.getByTestId("map-stage")
  await map.evaluate((element) => {
    element.style.overflow = "auto"
    element.scrollLeft = 0
  })
  await page.getByRole("button", { name: /새싹 네모식당/ }).click()
  await expect(page.locator("#place-detail-title")).toBeFocused()
  expect(await map.evaluate((element) => element.scrollLeft)).toBe(0)
})

test("fallback geography stays bounded and connected", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await page.screenshot({ path: ".omo/evidence/task-7/fix-r11/final-375-geography.png" })
  const bounded = await page.getByTestId("map-stage").evaluate((map) => {
    const mapRect = map.getBoundingClientRect()
    return [...map.querySelectorAll("[data-map-water]")].every((water) => {
      const rect = water.getBoundingClientRect()
      return (
        rect.left >= mapRect.left &&
        rect.right <= mapRect.right &&
        rect.top >= mapRect.top &&
        rect.bottom <= mapRect.bottom
      )
    })
  })
  expect(bounded).toBe(true)
})

test("place detail opening exposes start, in-flight, and settled states", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const surface = page.locator("[data-detail-phase]")
  const start = await page.evaluate(
    () =>
      new Promise<{ phase: string | null; transform: string; opacity: string }>((resolve) => {
        const read = (): void => {
          const element = document.querySelector<HTMLElement>("[data-detail-phase]")
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

test("fallback map remains solid and nonblank with five live markers", async ({ page }) => {
  await page.goto("/")
  const map = page.getByTestId("map-stage")
  await expect(map.locator("[aria-label*='샘플 장소']")).toBeVisible()
  await expect(map.locator("section[aria-label^='샘플 장소'] button")).toHaveCount(5)
  const background = await map
    .locator("div")
    .first()
    .evaluate((element) => {
      const styles = getComputedStyle(element)
      return { image: styles.backgroundImage, color: styles.backgroundColor }
    })
  expect(background.image).toBe("none")
  expect(background.color).not.toBe("rgba(0, 0, 0, 0)")
  await expect(map.locator("[data-map-water]")).toBeVisible()
  await expect(map.locator("[data-map-area]").first()).toBeVisible()
  await expect(map.locator("[data-map-junction]").first()).toBeVisible()
})

test("fallback map carries a layered field-guide hierarchy", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const map = page.getByTestId("map-stage")
  await expect(map.locator("[data-map-road]").first()).toBeVisible()
  await expect(map.locator("[data-map-block]").first()).toBeVisible()
  await expect(map.locator("[data-map-label]").first()).toBeVisible()
  await expect(map.locator("fieldset svg")).toHaveCount(5)
  await expect(page.getByRole("button", { name: /새싹 네모식당/ })).toBeVisible()
})

test("field-guide composition has dense live map structure and detail anatomy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const map = page.getByTestId("map-stage")
  await expect(map.locator("[data-map-road]").first()).toBeVisible()
  await expect(map.locator("[data-map-block]").first()).toBeVisible()
  await expect(map.locator("[data-map-label]").first()).toBeVisible()
  await page.getByRole("button", { name: /새싹 네모식당/ }).click()
  const detail = page.getByTestId("place-detail")
  await expect(detail.locator("[data-detail-summary]")).toBeVisible()
  await expect(detail.locator("[data-detail-meta]")).toHaveCount(2)
  await expect(detail.locator("[data-detail-menu]")).toBeVisible()
})

test("desktop detail is complementary and the field guide has connected terrain layers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto("/")
  const map = page.getByTestId("map-stage")
  await expect(map.locator("[data-map-water]")).toBeVisible()
  await expect(map.locator("[data-map-area]").first()).toBeVisible()
  await expect(map.locator("[data-map-junction]").first()).toBeVisible()
  await page.getByRole("button", { name: /새싹 네모식당/ }).click()
  await expect(page.getByRole("complementary", { name: "장소 상세" })).toBeVisible()
  const fifth = map.locator("fieldset button").nth(4)
  const hit = await fifth.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return target === element || element.contains(target)
  })
  expect(hit).toBe(true)
})

test("close keeps the surface mounted until its native transition completes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await page.getByRole("button", { name: /새싹 네모식당/ }).click()
  await page.waitForTimeout(350)
  await page.getByRole("button", { name: "상세 닫기" }).click()
  const closing = await page.locator("[data-detail-phase]").evaluate((element) => ({
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
  await page.getByRole("button", { name: /새싹 네모식당/ }).click()
  await page.waitForTimeout(350)
  await page.keyboard.press("Escape")
  const closing = await page.locator("[data-detail-phase]").evaluate((element) => ({
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
  const marker = page.getByRole("button", { name: /새싹 네모식당/ })
  await marker.click()
  await page.goBack()
  await page.waitForTimeout(350)
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(marker).toBeFocused()

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await marker.click()
  await page.getByRole("button", { name: "상세 닫기" }).click()
  await page.waitForTimeout(350)
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(marker).toBeFocused()
})

test("captures fresh production viewport and motion evidence", async ({ page }) => {
  const viewports = [
    { width: 375, height: 812, name: "375x812" },
    { width: 768, height: 1024, name: "768x1024" },
    { width: 1280, height: 800, name: "1280x800" },
  ] as const
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto("/")
    await page.screenshot({
      path: `.omo/evidence/task-7/fix-r11/final-${viewport.name}-map.png`,
    })
    await page.getByRole("button", { name: /새싹 네모식당/ }).click()
    await page.screenshot({
      path: `.omo/evidence/task-7/fix-r11/final-${viewport.name}-start.png`,
    })
    await page.waitForTimeout(120)
    await page.screenshot({
      path: `.omo/evidence/task-7/fix-r11/final-${viewport.name}-120ms.png`,
    })
    await page.waitForTimeout(200)
    await page.screenshot({
      path: `.omo/evidence/task-7/fix-r11/final-${viewport.name}-settled.png`,
    })
    await page.getByRole("button", { name: "상세 닫기" }).click()
    await expect(page.getByTestId("place-detail")).toHaveCount(0)
  }
})

test("reduced motion removes the sheet delay and still restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  const marker = page.getByRole("button", { name: /새싹 네모식당/ })
  await marker.click()
  const motion = await page.locator("[data-detail-phase]").evaluate((element) => ({
    phase: element.getAttribute("data-detail-phase"),
    duration: getComputedStyle(element).transitionDuration,
    transform: getComputedStyle(element).transform,
  }))
  expect(motion.phase).toBe("open")
  expect(motion.duration === "1e-05s" || motion.duration.includes("0.01")).toBe(true)
  expect(motion.transform).toBe("none")
  await page.getByRole("button", { name: "상세 닫기" }).click()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(marker).toBeFocused()
})
