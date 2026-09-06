import { expect, test } from "./map-test"

test("Given a slow place query, When the map is waiting, Then visible progress remains until results arrive", async ({
  page,
}, testInfo) => {
  // Given a real browser request held at the HTTP boundary.
  let releaseResponse: (() => void) | undefined
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve
  })
  await page.route("**/api/places?**", async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get("mode") !== "places") return route.continue()
    await responseGate
    return route.continue()
  })

  // When the discovery surface starts loading.
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await page.getByRole("button", { name: "검색 결과 펼치기", exact: true }).click()

  // Then status text and a meaningful progress indicator stay visible until data arrives.
  const statusText = page.getByText("장소를 찾고 있어요.", { exact: true })
  await expect(statusText).toBeVisible()
  const indicator = page.getByTestId("discovery-loading-indicator").last()
  await expect(indicator).toBeVisible()
  await expect(indicator).toHaveCSS("animation-name", "none")
  const indicatorGeometry = await indicator.evaluate((element) => {
    const style = getComputedStyle(element)
    const bounds = element.getBoundingClientRect()
    return {
      width: bounds.width,
      height: bounds.height,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderTopColor: style.borderTopColor,
      borderRightColor: style.borderRightColor,
    }
  })
  expect(indicatorGeometry).toEqual({
    width: 16,
    height: 16,
    borderTopWidth: "2px",
    borderRightWidth: "2px",
    borderTopColor: "rgb(24, 86, 59)",
    borderRightColor: "rgb(152, 187, 165)",
  })
  await page.screenshot({ path: testInfo.outputPath("loading-mobile-reduced-motion.png") })
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await expect(indicator).not.toHaveCSS("animation-name", "none")
  await page.screenshot({ path: testInfo.outputPath("loading-mobile-motion.png") })
  releaseResponse?.()
  await expect(statusText).toBeHidden()
  await expect(page.getByLabel("검색 결과 수")).toHaveText(/^\d+곳 중 \d+곳$/u)
})

test("Given a slow search, When a newer query finishes first, Then stale results cannot replace it", async ({
  page,
}, testInfo) => {
  // Given one delayed query and normal responses for every newer query.
  let releaseSlowQuery: (() => void) | undefined
  const slowQueryGate = new Promise<void>((resolve) => {
    releaseSlowQuery = resolve
  })
  await page.route("**/api/places?**", async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get("mode") !== "places" || url.searchParams.get("query") !== "샐러드")
      return route.continue()
    await slowQueryGate
    return route.continue()
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  const search = page.getByRole("searchbox", { name: "가게나 메뉴 검색" })

  // When the delayed search is superseded by a different query.
  await search.fill("샐러드")
  await expect(page.getByText("장소를 찾고 있어요.", { exact: true })).toBeVisible()
  await search.fill("콩")
  await expect(page.getByLabel("검색 결과 수")).toHaveText(/^\d+곳 중 \d+곳$/u)
  const settledCount = await page.getByLabel("검색 결과 수").textContent()
  releaseSlowQuery?.()

  // Then the current query and result count stay settled after the stale response is released.
  await expect(search).toHaveValue("콩")
  await expect(page.getByLabel("검색 결과 수")).toHaveText(settledCount ?? "")
  await page.screenshot({ path: testInfo.outputPath("loading-desktop-settled.png") })
})

test("Given delayed malformed detail data, When a place opens, Then loading becomes a retryable error", async ({
  page,
}, testInfo) => {
  // Given a delayed first detail response and a normal retry response.
  let releaseDetail: (() => void) | undefined
  const detailGate = new Promise<void>((resolve) => {
    releaseDetail = resolve
  })
  let releaseRetry: (() => void) | undefined
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve
  })
  let malformed = true
  await page.route("**/api/places/*", async (route) => {
    if (!malformed) {
      await retryGate
      return route.continue()
    }
    await detailGate
    malformed = false
    return route.fulfill({ contentType: "application/json", json: {} })
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")

  // When a result opens before its extended detail response arrives.
  await page.locator("[data-food-map-place-id]").first().click()
  const loading = page.getByText("상세 정보를 확인하고 있어요.", { exact: true })
  await expect(loading).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("detail-loading-desktop.png") })
  releaseDetail?.()

  // Then malformed data is an alert, and retry returns to the successful detail state.
  const detailAlert = page.locator('[role="alert"]').filter({
    hasText: "추가 정보를 불러오지 못했어요.",
  })
  await expect(detailAlert).toBeVisible()
  await page.getByRole("button", { name: "상세 정보 다시 불러오기" }).click()
  await expect(loading).toBeVisible()
  releaseRetry?.()
  await expect(loading).toBeHidden()
  await expect(detailAlert).toHaveCount(0)
})

test("Given a stuck place request, When the request reaches its bound, Then loading becomes an error", async ({
  page,
}) => {
  test.setTimeout(20_000)
  // Given a place response that never arrives.
  await page.route("**/api/places?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") !== "places")
      return route.continue()
    await new Promise(() => undefined)
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")

  // When the bounded request duration elapses, Then the loading state cannot remain forever.
  await expect(page.getByText("장소를 찾고 있어요.", { exact: true })).toBeVisible()
  await expect(
    page.locator('[role="alert"]').filter({ hasText: "장소를 불러오지 못했어요." }),
  ).toBeVisible({ timeout: 12_000 })
  await expect(page.getByRole("button", { name: "장소 다시 불러오기" })).toBeVisible()
})

test("Given loaded results, When a changed query fails, Then progress stops and retry can recover", async ({
  page,
}) => {
  // Given a successful initial result followed by a failed changed query.
  let failChangedQuery = true
  await page.route("**/api/places?**", async (route) => {
    const url = new URL(route.request().url())
    if (
      url.searchParams.get("mode") === "places" &&
      url.searchParams.get("query") === "실패" &&
      failChangedQuery
    )
      return route.fulfill({ status: 503, json: { error: "catalog_unavailable", retry: true } })
    return route.continue()
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await expect(page.getByLabel("검색 결과 수")).toHaveText(/^\d+곳 중 \d+곳$/u)

  // When a changed query fails after the previous key had loaded.
  await page.getByRole("searchbox", { name: "가게나 메뉴 검색" }).fill("실패")
  await expect(
    page.locator('[role="alert"]').filter({ hasText: "장소를 불러오지 못했어요." }),
  ).toBeVisible()

  // Then progress is finished, and retry reaches a settled response.
  await expect(page.getByLabel("검색 결과 수")).not.toHaveText("찾는 중")
  await expect(page.getByTestId("discovery-loading-indicator")).toHaveCount(0)
  failChangedQuery = false
  await page.getByRole("button", { name: "장소 다시 불러오기" }).click()
  await expect(page.getByLabel("검색 결과 수")).toHaveText("0곳 중 0곳")
})
