import { expect, test } from "./map-test"

const MAP_SHARE = "/?q=&tag=balanced&lat=37.501&lng=127.033&z=15"
const PLACE_SHARE = "/places/test-sprout-square"

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
})

test("session storage failures never block list or marker detail history", async ({
  page,
}, testInfo) => {
  // Given
  const analyticsBodies: string[] = []
  const browserDiagnostics: string[] = []
  const pageErrors: string[] = []
  page.on("console", (message) => browserDiagnostics.push(message.text()))
  page.on("pageerror", (error) => pageErrors.push(error.message))
  for (const host of ["http://127.0.0.1:3498", "https://127.0.0.1:4566/posthog"])
    await page.route(`${host}/**`, async (route) => {
      analyticsBodies.push(route.request().postData() ?? "")
      await route.fulfill({ status: 204 })
    })
  await page.addInitScript(() => {
    Reflect.set(globalThis, "healthmapStorageFailure", "setItem")
    const getItem = Storage.prototype.getItem
    const removeItem = Storage.prototype.removeItem
    const setItem = Storage.prototype.setItem
    Object.defineProperties(Storage.prototype, {
      getItem: {
        configurable: true,
        value(this: Storage, key: string) {
          if (
            this === window.sessionStorage &&
            Reflect.get(globalThis, "healthmapStorageFailure") === "getItem"
          )
            throw new DOMException("storage unavailable", "QuotaExceededError")
          return Reflect.apply(getItem, this, [key])
        },
      },
      removeItem: {
        configurable: true,
        value(this: Storage, key: string) {
          if (
            this === window.sessionStorage &&
            Reflect.get(globalThis, "healthmapStorageFailure") === "removeItem"
          )
            throw new DOMException("storage unavailable", "QuotaExceededError")
          return Reflect.apply(removeItem, this, [key])
        },
      },
      setItem: {
        configurable: true,
        value(this: Storage, key: string, value: string) {
          if (
            this === window.sessionStorage &&
            Reflect.get(globalThis, "healthmapStorageFailure") === "setItem"
          )
            throw new DOMException("storage unavailable", "QuotaExceededError")
          return Reflect.apply(setItem, this, [key, value])
        },
      },
    })
  })
  await page.goto("/")
  const query = "새싹"
  const search = page.getByRole("searchbox", { name: "장소와 메뉴 검색" })
  await search.fill(query)
  const result = page.getByRole("button", { name: "새싹 네모식당 상세 보기" })

  // When
  await result.click()

  // Then
  await expect(page).toHaveURL(PLACE_SHARE)
  await expect(page.getByRole("heading", { name: "새싹 네모식당" })).toBeFocused()
  await expect(
    page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
  ).toBeVisible()
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())
  await page.screenshot({
    path: testInfo.outputPath("manual-list-open.png"),
  })
  await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(result).toBeFocused()
  await expect(search).toHaveValue(query)

  // When
  await page.evaluate(() => Reflect.set(globalThis, "healthmapStorageFailure", "getItem"))
  await page.goto(MAP_SHARE)
  await expect(page.getByTestId("map-stage")).toBeVisible()
  await page.evaluate(() => Reflect.set(globalThis, "healthmapStorageFailure", "removeItem"))
  await page.reload()
  await expect(page.getByTestId("map-stage")).toBeVisible()
  await page.evaluate(() => Reflect.set(globalThis, "healthmapStorageFailure", "setItem"))
  const marker = page.getByTestId("naver-map").getByRole("button", { name: "새싹 네모식당" })
  await marker.focus()
  await marker.press("Enter")
  await expect(page).toHaveURL(PLACE_SHARE)
  await expect(
    page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
  ).toBeVisible()
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())
  await page.screenshot({
    path: testInfo.outputPath("manual-marker-open.png"),
  })
  await page.goBack()

  // Then
  await expect(page).toHaveURL(MAP_SHARE)
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(marker).toBeFocused()
  expect(browserDiagnostics.join("\n")).not.toContain(query)
  expect(pageErrors).toEqual([])
  expect(analyticsBodies.join("\n")).not.toContain(query)
  const observation = {
    analyticsQueryLeak: false,
    consoleQueryLeak: false,
    detailCount: await page.getByTestId("place-detail").count(),
    finalUrl: new URL(page.url()).pathname + new URL(page.url()).search,
    markerFocused: await marker.evaluate((element) => document.activeElement === element),
    pageErrorCount: pageErrors.length,
    storageFailures: ["getItem", "removeItem", "setItem"],
  }
  expect(observation).toMatchObject({
    analyticsQueryLeak: false,
    consoleQueryLeak: false,
    detailCount: 0,
    markerFocused: true,
    pageErrorCount: 0,
  })
  await testInfo.attach("storage-resilience-observation", {
    body: Buffer.from(JSON.stringify(observation, null, 2)),
    contentType: "application/json",
  })
})
