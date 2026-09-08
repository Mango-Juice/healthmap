import type { Page } from "@playwright/test"
import { expect, test } from "./map-test"

const openCurrentResults = async (page: Page, expand = false): Promise<void> => {
  const outsideResults = page.getByRole("button", { name: "현재 지도 밖 5곳 보기" })
  if (await outsideResults.isVisible()) await outsideResults.click()
  if (!expand) return
  const drawerToggle = page.getByRole("button", { name: "검색 결과 펼치기", exact: true })
  if (await drawerToggle.isVisible()) await drawerToggle.click()
  await expect(page.locator("[data-food-map-place-id]").first()).toBeVisible()
}

test("Given the enabled health map, When it opens, Then only meal choices with a stated selection basis are shown", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")

  await expect(page.getByRole("heading", { level: 1, name: "건강식 지도" })).toBeVisible()
  const markers = page.locator('[data-test-naver-marker="true"]')
  await openCurrentResults(page)
  const drawerToggle = page.getByRole("button", { name: "검색 결과 펼치기", exact: true })
  await expect(drawerToggle).toBeVisible()
  await expect(page.getByText("건강한 한 끼", { exact: true })).toHaveCount(0)

  await expect(page.getByRole("button", { name: "잡곡·현미 필터" })).toBeVisible()
  await expect(page.getByRole("button", { name: "채식 메뉴 필터" })).toBeVisible()
  await expect(page.getByRole("link", { name: "개인정보" })).toHaveCount(0)
  await expect(page.getByText("매칭", { exact: true })).toHaveCount(0)
  await expect(page.getByText("공식 근거 보기", { exact: true })).toHaveCount(0)
  await expect(page.getByText(/biome-ignore/)).toHaveCount(0)

  await drawerToggle.click()
  await expect(page.getByRole("button", { name: "검색 결과 접기", exact: true })).toBeVisible()
  await expect(markers).toHaveCount(5)
  await expect(markers.first()).toBeVisible()
  await expect(markers.first()).toHaveAttribute(
    "data-marker-icon",
    /food-map-(salad_poke|whole_grain|plant_based)[.]svg/,
  )
})

test("Given a health-conscious diner, When a place is selected, Then practical food details replace review metadata", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await openCurrentResults(page)

  await page.getByRole("searchbox", { name: "가게나 메뉴 검색" }).fill("무지개 한그릇 연구소")
  await expect(page.getByLabel("검색 결과 수")).toHaveText("1곳 중 1곳")
  await page.getByRole("button", { name: "무지개 한그릇 연구소 자세히 보기" }).click()

  await expect(page.getByRole("heading", { level: 2, name: "무지개 한그릇 연구소" })).toBeFocused()
  await page.getByRole("button", { name: "메뉴 펼치기", exact: true }).click()
  await expect(page.getByText("구운콩 단백 그릇", { exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { level: 3, name: "조건에 맞는 메뉴" })).toBeVisible()
  await expect(page.getByText(/원$/)).toHaveCount(0)
  await expect(page.getByText("매칭", { exact: true })).toHaveCount(0)
  await expect(page.getByText("공식 근거 보기", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "무지개 한그릇 연구소 길찾기" })).toHaveAttribute(
    "href",
    /https:\/\/map[.]naver[.]com\//,
  )
})

test("Given a list-origin result opener, When detail is dismissed with Escape, Then the remounted result is visible and focused", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await openCurrentResults(page, true)
  const result = page.locator("[data-food-map-place-id]").first()
  await expect(result).toBeVisible()
  const placeId = await result.getAttribute("data-food-map-place-id")
  const resultLabel = await result.getAttribute("aria-label")
  if (placeId === null) throw new Error("list result place ID missing")
  if (resultLabel === null) throw new Error("list result accessible label missing")

  await result.click()
  await expect(
    page.getByRole("heading", { level: 2, name: resultLabel.replace(" 자세히 보기", "") }),
  ).toBeFocused()

  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: "검색 결과 접기", exact: true })).toBeVisible()
  const restored = page.locator(`[data-food-map-place-id="${placeId}"]`)
  await expect(restored).toBeVisible()
  await expect(restored).toBeFocused()
  const focus = await page.evaluate(() => ({
    activePlaceId: document.activeElement?.getAttribute("data-food-map-place-id"),
    drawerExpanded: document.querySelector("[aria-expanded='true']") !== null,
  }))
  expect(focus).toEqual({ activePlaceId: placeId, drawerExpanded: true })
  await page.screenshot({ path: testInfo.outputPath("list-origin-escape-375x812.png") })
  await testInfo.attach("list-origin-escape-focus", {
    body: Buffer.from(JSON.stringify(focus, null, 2)),
    contentType: "application/json",
  })
})

test("Given a list-origin result opener, When detail is closed by its explicit control, Then the remounted result is visible and focused", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await openCurrentResults(page, true)
  const result = page.locator("[data-food-map-place-id]").first()
  await expect(result).toBeVisible()
  const placeId = await result.getAttribute("data-food-map-place-id")
  if (placeId === null) throw new Error("list result place ID missing")

  await result.click()
  await page.getByRole("button", { name: "장소 닫기", exact: true }).click()

  await expect(page.getByRole("button", { name: "검색 결과 접기", exact: true })).toBeVisible()
  const restored = page.locator(`[data-food-map-place-id="${placeId}"]`)
  await expect(restored).toBeVisible()
  await expect(restored).toBeFocused()
})

test("Given rapid list-origin detail cycles, When the same remounted result is reopened and closed, Then each lifecycle restores a visible focused result without browser errors", async ({
  page,
}) => {
  const browserErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text())
  })
  page.on("pageerror", (error) => browserErrors.push(error.message))
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await openCurrentResults(page, true)
  const result = page.locator("[data-food-map-place-id]").first()
  await expect(result).toBeVisible()
  const placeId = await result.getAttribute("data-food-map-place-id")
  const resultLabel = await result.getAttribute("aria-label")
  if (placeId === null) throw new Error("rapid lifecycle result place ID missing")
  if (resultLabel === null) throw new Error("rapid lifecycle result accessible label missing")
  const title = page.getByRole("heading", {
    level: 2,
    name: resultLabel.replace(" 자세히 보기", ""),
  })
  const restored = page.locator(`[data-food-map-place-id="${placeId}"]`)

  await result.click()
  await expect(title).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(restored).toBeVisible()
  await expect(restored).toBeFocused()
  await expect(page.getByRole("button", { name: "검색 결과 접기", exact: true })).toBeVisible()

  await restored.click()
  await expect(title).toBeFocused()
  await page.getByRole("button", { name: "장소 닫기", exact: true }).click()
  await expect(restored).toBeVisible()
  await expect(restored).toBeFocused()
  await expect(page.getByRole("button", { name: "검색 결과 접기", exact: true })).toBeVisible()
  expect(browserErrors).toEqual([])
})

test("Given a marker-origin selection, When detail is closed with Escape, Then the marker regains focus while the drawer stays collapsed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await openCurrentResults(page)
  const marker = page
    .getByTestId("food-map-naver-map")
    .getByRole("button", { name: "구름 도시락 공방" })
  await expect(marker).toBeVisible()
  await marker.click()
  await page.keyboard.press("Escape")

  await expect(page.getByRole("button", { name: "검색 결과 펼치기", exact: true })).toBeVisible()
  await expect(marker).toBeFocused()
})

test("Given a desktop list-origin selection, When it is dismissed with Escape, Then the visible pane result regains focus", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await openCurrentResults(page)
  const result = page.locator("[data-food-map-place-id]").first()
  await expect(result).toBeVisible()
  const placeId = await result.getAttribute("data-food-map-place-id")
  if (placeId === null) throw new Error("desktop list result place ID missing")

  await result.click()
  await page.keyboard.press("Escape")

  const restored = page.locator(`[data-food-map-place-id="${placeId}"]`)
  await expect(restored).toBeVisible()
  await expect(restored).toBeFocused()
  await expect(page.getByTestId("food-map-drawer-handle")).toBeHidden()
  await page.screenshot({ path: testInfo.outputPath("list-origin-escape-1280x800.png") })
})

test("Given the collapsed mobile drawer, When its buttons are activated, Then tap and keyboard controls remain available", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await openCurrentResults(page, true)
  const handle = page.getByTestId("food-map-drawer-handle")
  const close = page.getByRole("button", { name: "검색 결과 접기", exact: true })
  await close.click()
  const open = page.getByRole("button", { name: "검색 결과 펼치기", exact: true })
  await expect(open).toBeInViewport()
  await expect(handle.locator("span[aria-hidden='true']")).toHaveCount(0)
  const collapsedY = await handle.evaluate((element) => element.getBoundingClientRect().y)

  await open.click()

  const expanded = page.getByRole("button", { name: "검색 결과 접기", exact: true })
  await expect(expanded).toHaveAttribute("aria-expanded", "true")
  await expect
    .poll(() => handle.evaluate((element) => element.getBoundingClientRect().y))
    .toBeLessThan(collapsedY - 50)
  await handle.evaluate(async (element) => {
    const stack = element.closest("section[aria-label='건강식 검색 결과']")?.parentElement
    await Promise.all(stack?.getAnimations().map((animation) => animation.finished) ?? [])
  })
  await expanded.focus()
  await page.keyboard.press("Enter")

  await expect(open).toHaveAttribute("aria-expanded", "false")
  await expect(handle).toHaveAttribute("data-expanded", "false")
  await expect(open).toBeInViewport()
})

test("Given a 200 percent equivalent viewport, When filters are used, Then every category remains discoverable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 188, height: 406 })
  await page.goto("/")
  await openCurrentResults(page)

  const compactFilter = page.getByLabel("메뉴 유형")
  await expect(compactFilter).toBeVisible()
  await expect(compactFilter.locator("option")).toHaveCount(6)
  await compactFilter.selectOption("plant_based")
  await expect(page.getByLabel("검색 결과 수")).toHaveText(/곳 중 \d+곳/)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false)
})

test("Given a place without authorized media, When selected, Then useful details remain without a fabricated image", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await openCurrentResults(page)
  await page.getByRole("searchbox").fill("무지개 한그릇 연구소")
  await page.getByRole("button", { name: "무지개 한그릇 연구소 자세히 보기" }).click()
  await expect(page.locator("figure img")).toHaveCount(0)
  await expect(page.getByRole("link", { name: "무지개 한그릇 연구소 길찾기" })).toBeVisible()
})

test("Given a desktop food map, When the candidate list is long, Then only the panel owns vertical scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await openCurrentResults(page)

  await page.locator("[data-food-map-place-id]").first().waitFor()
  const layout = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[aria-label="건강식 검색 결과"]')
    const scrollBody = panel?.querySelector<HTMLElement>('div[class*="scrollBody"]')
    return {
      pageHeight: document.documentElement.scrollHeight,
      panelClientHeight: scrollBody?.clientHeight ?? 0,
      panelOverflow: scrollBody ? getComputedStyle(scrollBody).overflowY : "missing",
      panelScrollHeight: scrollBody?.scrollHeight ?? 0,
      viewportHeight: window.innerHeight,
    }
  })

  expect(layout.pageHeight).toBe(layout.viewportHeight)
  expect(layout.panelOverflow).toBe("auto")
  expect(layout.panelScrollHeight).toBeGreaterThan(layout.panelClientHeight)
})

test("Given forced colors, When current filter controls receive keyboard focus, Then the focus ring remains explicit", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active" })
  await page.setViewportSize({ width: 188, height: 406 })
  await page.goto("/")
  await openCurrentResults(page)

  const filter = page.getByLabel("메뉴 유형")
  await filter.focus()
  await expect(filter).toBeFocused()
  expect(await filter.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid")
})
