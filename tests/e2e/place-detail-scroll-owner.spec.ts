import { expect, test } from "./map-test"

type ScrollOwnerMeasurement = {
  readonly controls: readonly {
    readonly height: number
    readonly label: string
    readonly width: number
  }[]
  readonly detailPhase: string | null
  readonly horizontalOverflow: boolean
  readonly owners: readonly string[]
  readonly pageHorizontalOverflow: boolean
  readonly rail: {
    readonly clientWidth: number
    readonly overflowX: string
    readonly overflowY: string
    readonly scrollWidth: number
  }
  readonly selectionInsideMap: boolean
  readonly viewport: string
}

type InteractionMeasurement = {
  readonly bodyScrollable: boolean
  readonly bodyWheel: boolean
  readonly closeFocus: boolean
  readonly escapeFocus: boolean
  readonly historyFocus: boolean
  readonly viewport: string
}

const viewportMatrix = [
  { height: 812, name: "375x812", width: 375 },
  { height: 1024, name: "768x1024", width: 768 },
  { height: 800, name: "1280x800", width: 1280 },
] as const

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
})

test("detail screenshots wait for a settled surface with one vertical owner and stable controls", async ({
  page,
}, testInfo) => {
  const measurements: ScrollOwnerMeasurement[] = []
  const interactions: InteractionMeasurement[] = []
  const phase = process.env["SCROLL_OWNER_PHASE"] ?? "run"

  for (const viewport of viewportMatrix) {
    await page.setViewportSize(viewport)
    await page.goto("/")
    await expect(page.getByText("NAVER 지도 연결됨")).toBeVisible()
    await page.getByRole("button", { name: "구름 도시락 공방 상세 보기" }).click()
    await expect(page.getByTestId("place-detail")).toBeVisible()
    await expect(
      page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
    ).toBeVisible()

    const measurement = await page.evaluate((viewportName) => {
      const labelFor = (element: HTMLElement): string =>
        element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName
      const visible = (element: HTMLElement): boolean => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && element.getClientRects().length > 0
      }
      const rail = document.querySelector<HTMLElement>("fieldset")
      if (rail === null) throw new Error("filter rail missing")
      const detailSurface = document.querySelector<HTMLElement>(
        "[data-detail-phase]:not([data-testid='map-stage'])",
      )
      const map = document.querySelector<HTMLElement>("[data-testid='naver-map']")
      const selection = document.querySelector<HTMLElement>("[role='status']")
      const railStyle = getComputedStyle(rail)
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>("button, input, a, [role='button']"),
      )
        .filter(visible)
        .filter(
          (element) =>
            element.closest("[data-test-naver-marker]") === null &&
            element.closest("[data-testid='naver-map']") === null &&
            element.closest("canvas") === null,
        )
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return { height: rect.height, label: labelFor(element), width: rect.width }
        })
      const owners = Array.from(document.querySelectorAll<HTMLElement>("*"))
        .filter((element) => {
          const style = getComputedStyle(element)
          return style.overflowY === "auto" || style.overflowY === "scroll"
        })
        .map(
          (element) =>
            element.dataset["testid"] ??
            element.getAttribute("role") ??
            element.tagName.toLowerCase(),
        )
      return {
        controls,
        detailPhase: detailSurface?.dataset["detailPhase"] ?? null,
        horizontalOverflow: rail.scrollWidth > rail.clientWidth,
        owners,
        pageHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        rail: {
          clientWidth: rail.clientWidth,
          overflowX: railStyle.overflowX,
          overflowY: railStyle.overflowY,
          scrollWidth: rail.scrollWidth,
        },
        selectionInsideMap:
          map === null ||
          selection === null ||
          selection.getBoundingClientRect().right <= map.getBoundingClientRect().right,
        viewport: viewportName,
      }
    }, viewport.name)
    measurements.push(measurement)
    await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())
    await page.screenshot({ path: testInfo.outputPath(`${phase}-${viewport.name}.png`) })

    const filters = page.locator("fieldset").getByRole("button")
    await expect(filters).toHaveCount(5)
    for (let index = 0; index < 5; index += 1) {
      await filters.nth(index).focus()
      await expect(filters.nth(index)).toBeFocused()
      await filters.nth(index).press("Enter")
      await expect(filters.nth(index)).toHaveAttribute("aria-pressed", "true")
    }
    await filters.first().press("Enter")
    await expect(filters.first()).toHaveAttribute("aria-pressed", "true")

    const body = page.getByTestId("place-detail-body")
    const bodyScrollable = await body.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    )
    if (bodyScrollable) {
      await body.hover()
      await page.mouse.wheel(0, 520)
      await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    }

    const resultCard = page.getByRole("button", { name: "구름 도시락 공방 상세 보기" })
    await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
    await expect(page.getByTestId("place-detail")).toHaveCount(0)
    await expect(resultCard).toBeFocused()
    const closeFocus = await resultCard.evaluate((element) => document.activeElement === element)

    await resultCard.press("Enter")
    await expect(
      page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("place-detail")).toHaveCount(0)
    await expect(resultCard).toBeFocused()
    const escapeFocus = await resultCard.evaluate((element) => document.activeElement === element)

    await resultCard.press("Enter")
    await expect(
      page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
    ).toBeVisible()
    await page.goBack()
    await expect(page.getByTestId("place-detail")).toHaveCount(0)
    await expect(resultCard).toBeFocused()
    interactions.push({
      bodyScrollable,
      bodyWheel: bodyScrollable,
      closeFocus,
      escapeFocus,
      historyFocus: await resultCard.evaluate((element) => document.activeElement === element),
      viewport: viewport.name,
    })
  }

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  await expect(
    page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
  ).toBeVisible()
  const stress = await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll<HTMLElement>("[data-testid='place-detail-body'] a"),
    )
    if (links.length === 0) throw new Error("detail evidence link missing")
    for (const link of links)
      link.textContent =
        "긴 한글 검증 근거 https://sources.example.test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const body = document.querySelector<HTMLElement>("[data-testid='place-detail-body']")
    if (body !== null) body.scrollTop = body.scrollHeight
    const lastLink = links[links.length - 1]
    if (lastLink === undefined) throw new Error("detail evidence link missing")
    const linkRect = lastLink.getBoundingClientRect()
    const menuName = body?.querySelector<HTMLElement>("li strong")
    if (menuName === undefined || menuName === null) throw new Error("detail menu name missing")
    return {
      detailHorizontalOverflow: body !== null && body.scrollWidth > body.clientWidth,
      linkVisible: linkRect.top >= 0 && linkRect.bottom <= window.innerHeight,
      linkWidth: linkRect.width,
      menuNameWidth: menuName.getBoundingClientRect().width,
      pageHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    }
  })
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())
  await page.screenshot({
    path: testInfo.outputPath(`${phase}-375x812-long-korean-url.png`),
  })
  await testInfo.attach(`${phase}-measurements`, {
    body: Buffer.from(JSON.stringify({ interactions, measurements, stress }, null, 2)),
    contentType: "application/json",
  })

  for (const measurement of measurements) {
    expect(measurement.detailPhase).toBe("open")
    expect(measurement.owners).toEqual(["place-detail-body"])
    expect(["auto", "scroll"]).toContain(measurement.rail.overflowX)
    expect(measurement.pageHorizontalOverflow).toBe(false)
    expect(measurement.selectionInsideMap).toBe(true)
    expect(measurement.controls.every(({ width, height }) => width >= 44 && height >= 44)).toBe(
      true,
    )
  }
  expect(
    interactions.every(
      ({ closeFocus, escapeFocus, historyFocus }) => closeFocus && escapeFocus && historyFocus,
    ),
  ).toBe(true)
  expect(interactions.every(({ bodyScrollable, bodyWheel }) => !bodyScrollable || bodyWheel)).toBe(
    true,
  )
  expect(stress.detailHorizontalOverflow).toBe(false)
  expect(stress.linkVisible).toBe(true)
  expect(stress.linkWidth).toBeGreaterThanOrEqual(120)
  expect(stress.menuNameWidth).toBeGreaterThanOrEqual(120)
  expect(stress.pageHorizontalOverflow).toBe(false)
})
