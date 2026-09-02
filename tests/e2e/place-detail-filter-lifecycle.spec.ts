import { expect, test } from "./map-test"

type MatrixRect = {
  readonly bottom: number
  readonly left: number
  readonly right: number
  readonly top: number
}

type MatrixFilter = {
  readonly ariaPressed: string | null
  readonly center: { readonly x: number; readonly y: number }
  readonly inViewport: boolean
  readonly nativeHit: boolean
  readonly noOverflow: boolean
  readonly oneLine: boolean
}

type MatrixSnapshot = {
  readonly complementary: {
    readonly name: string | null
    readonly present: boolean
    readonly role: string | null
  }
  readonly filters: readonly MatrixFilter[]
  readonly focusOwner: string | null
  readonly focusRestored: boolean
  readonly label: string
  readonly mapRect: MatrixRect | null
  readonly mapScrollLeft: number
  readonly nonOverlapping: boolean
  readonly paneRect: MatrixRect | null
  readonly phase: string
  readonly railScrollLeft: number
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
})

test.describe.configure({ retries: 0 })

test("768 all-five filter clicks remain native through every detail lifecycle state", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto("/")
  await expect(page.getByText("NAVER 지도 연결됨")).toBeVisible()
  const filters = page.getByTestId("map-stage").locator("fieldset button")
  const matrix: MatrixSnapshot[] = []
  const capture = async (label: string): Promise<MatrixSnapshot> =>
    page.evaluate((stateLabel) => {
      const rectSnapshot = (rect: DOMRect | undefined): MatrixRect | null =>
        rect === undefined
          ? null
          : { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top }
      const map = document.querySelector<HTMLElement>("[data-testid='map-stage']")
      const paper = map?.querySelector<HTMLElement>("[data-testid='naver-map']")
      const pane = map?.querySelector<HTMLElement>(
        "[data-detail-phase]:not([data-testid='map-stage'])",
      )
      const buttons = [...document.querySelectorAll<HTMLButtonElement>("fieldset button")]
      const paneRect = rectSnapshot(pane?.getBoundingClientRect())
      const mapRect = rectSnapshot(paper?.getBoundingClientRect())
      const active = document.activeElement
      const focusOwner =
        active instanceof HTMLElement
          ? (active.getAttribute("aria-label") ??
            active.id ??
            active.getAttribute("data-testid") ??
            active.tagName.toLowerCase())
          : null
      const complementary = {
        name: pane?.getAttribute("aria-label") ?? null,
        present: pane !== null && pane !== undefined,
        role: pane?.tagName === "ASIDE" ? "complementary" : null,
      }
      const filtersSnapshot = buttons.map((button) => {
        const rect = button.getBoundingClientRect()
        const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        const target = document.elementFromPoint(center.x, center.y)
        const labelElement = button.querySelector("span")
        const lineHeight =
          labelElement === null ? 0 : Number.parseFloat(getComputedStyle(labelElement).lineHeight)
        return {
          ariaPressed: button.getAttribute("aria-pressed"),
          center,
          inViewport:
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            rect.top >= 0 &&
            rect.bottom <= innerHeight,
          nativeHit: target === button || button.contains(target),
          noOverflow: labelElement !== null && labelElement.scrollWidth <= labelElement.clientWidth,
          oneLine:
            labelElement !== null &&
            labelElement.getBoundingClientRect().height <= lineHeight * 1.1,
        }
      })
      return {
        complementary,
        filters: filtersSnapshot,
        focusOwner,
        focusRestored:
          active instanceof HTMLElement &&
          (active.getAttribute("aria-pressed") === "true" ||
            active.matches("[data-test-naver-marker='true']")),
        label: stateLabel,
        mapRect,
        mapScrollLeft: map?.scrollLeft ?? -1,
        nonOverlapping: paneRect === null || mapRect === null || paneRect.left >= mapRect.right,
        paneRect,
        phase: pane?.getAttribute("data-detail-phase") ?? "closed",
        railScrollLeft: map?.querySelector<HTMLElement>("fieldset")?.scrollLeft ?? -1,
      }
    }, label)
  const assertState = async (state: string, expectedPhase?: string) => {
    const snapshot = await capture(state)
    expect(snapshot.mapScrollLeft, state).toBe(0)
    expect(snapshot.railScrollLeft, state).toBe(0)
    if (expectedPhase !== undefined) expect(snapshot.phase, state).toBe(expectedPhase)
    expect(snapshot.filters, state).toHaveLength(5)
    expect(
      snapshot.filters.every(
        ({ nativeHit, inViewport, oneLine, noOverflow }) =>
          nativeHit && inViewport && oneLine && noOverflow,
      ),
      state,
    ).toBe(true)
    if (snapshot.complementary.present) {
      expect(snapshot.complementary.role, state).toBe("complementary")
      expect(snapshot.complementary.name, state).toBe("장소 상세")
      expect(snapshot.nonOverlapping, state).toBe(true)
      const paneRole = page.getByRole("complementary", { name: "장소 상세" })
      if (state.startsWith("closing")) await expect(paneRole).toHaveCount(1)
      else await expect(paneRole).toBeVisible()
    } else {
      await expect(page.getByRole("complementary", { name: "장소 상세" })).toHaveCount(0)
    }
    if (state === "restored") expect(snapshot.focusRestored, state).toBe(true)
    matrix.push(snapshot)
    return snapshot
  }
  const clickOne = async (state: string, index: number, expectedPhase?: string) => {
    await filters.nth(index).click()
    await expect(filters.nth(index), `${state} filter ${index}`).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await assertState(`${state}-after-filter-${index}`, expectedPhase)
  }
  const clickAll = async (state: string, expectedPhase?: string, startIndex = 0) => {
    for (let index = startIndex; index < 5; index += 1) {
      await clickOne(state, index, expectedPhase)
    }
  }

  await assertState("closed")
  await clickAll("closed")
  await filters.nth(0).click()
  const marker = page.getByTestId("naver-map").getByRole("button", { name: "구름 도시락 공방" })
  await marker.click()
  await expect(
    page.locator("[data-detail-phase='opening']:not([data-testid='map-stage'])"),
  ).toBeVisible()
  await assertState("opening", "opening")
  await clickOne("opening", 0)
  await expect(
    page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
  ).toBeVisible()
  await assertState("settled", "open")
  await clickAll("settled", "open")
  await filters.nth(0).click()
  await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
  await expect(
    page.locator("[data-detail-phase='closing']:not([data-testid='map-stage'])"),
  ).toBeVisible()
  await assertState("closing", "closing")
  await clickOne("closing", 0)
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await assertState("restored", "closed")
  await clickAll("restored", "closed", 1)

  await testInfo.attach("768-state-matrix", {
    body: Buffer.from(JSON.stringify({ viewport: "768x1024", states: matrix }, null, 2)),
    contentType: "application/json",
  })
})
test("desktop title focus does not scroll its map ancestor", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto("/")
  const map = page.getByTestId("map-stage")
  await map.evaluate((element) => {
    element.style.overflow = "auto"
    element.scrollLeft = 0
  })
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  await expect(page.locator("#place-detail-title")).toBeFocused()
  expect(await map.evaluate((element) => element.scrollLeft)).toBe(0)
})
