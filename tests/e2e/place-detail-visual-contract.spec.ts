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

test("framework capture chrome cleanup tolerates an absent portal and button before mobile detail evidence", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const isHostedProduction =
    testInfo.project.use.baseURL === process.env["E2E_BASE_URL"] &&
    process.env["E2E_BASE_URL"] !== undefined
  const developerPortal = page.locator("nextjs-portal")
  const developerChrome = page.getByRole("button", { name: "Open Next.js Dev Tools" })
  const beforePortalCount = await developerPortal.count()
  const beforeChromeCount = await developerChrome.count()
  await page.evaluate(() => {
    for (const portal of document.querySelectorAll("nextjs-portal")) portal.remove()
  })
  if (beforeChromeCount > 0) {
    await developerChrome.evaluateAll((elements) => {
      for (const element of elements) element.remove()
    })
  }
  console.log(
    JSON.stringify({
      devtoolsSurface: {
        beforeChromeCount,
        beforePortalCount,
        mode: isHostedProduction ? "hosted-production" : "local-development",
        afterChromeCount: await developerChrome.count(),
        afterPortalCount: await developerPortal.count(),
      },
    }),
  )

  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  await expect(
    page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "공유", exact: true })).toBeVisible()
  await expect(page.getByTestId("naver-map").locator("nextjs-portal")).toHaveCount(0)
})
test("200 percent zoom keeps short Korean header phrases intact and the full surface reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 188, height: 406 })
  await page.goto("/")
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())

  const reflow = await page
    .locator("header")
    .first()
    .evaluate((header) => {
      const title = header.querySelector("h1")
      const refresh = [...header.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "장소 새로고침",
      )
      const textLineCount = (element: Element | null): number => {
        if (element === null) return 0
        const range = document.createRange()
        range.selectNodeContents(element)
        return range.getClientRects().length
      }
      return {
        headerFits: header.scrollWidth <= header.clientWidth,
        refreshLines: textLineCount(refresh ?? null),
        titleLines: textLineCount(title),
      }
    })

  expect(reflow).toEqual({ headerFits: true, refreshLines: 1, titleLines: 1 })
  const trayToggle = page.getByRole("button", { name: /검색 결과 5곳/ })
  await expect(trayToggle).toBeVisible()
  await expect
    .poll(() =>
      trayToggle.evaluate((element) => {
        const range = document.createRange()
        const label = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)
        if (label === undefined) return 0
        range.selectNodeContents(label)
        return range.getClientRects().length
      }),
    )
    .toBe(1)
  await expect(page.getByRole("searchbox", { name: "장소와 메뉴 검색" })).toBeVisible()
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  const placeTitle = page.getByRole("heading", { name: "새싹 네모식당" })
  await expect(placeTitle).toBeVisible()
  await expect
    .poll(() =>
      placeTitle.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return range.getClientRects().length
      }),
    )
    .toBe(1)
  await expect(page.getByRole("button", { name: "공유", exact: true })).toBeVisible()
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
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  const detail = page.getByTestId("place-detail")
  await expect(
    page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
  ).toBeVisible()
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
