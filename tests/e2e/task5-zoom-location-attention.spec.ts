import { expect, installMapTestRoutes, test } from "./map-test"

test("200 percent zoom keeps denied location attention above the tray and its toggle", async ({
  browser,
  baseURL,
}, testInfo) => {
  if (baseURL === undefined) throw new Error("Playwright baseURL is required")
  const context = await browser.newContext({
    baseURL,
    deviceScaleFactor: 2,
    viewport: { height: 406, width: 188 },
  })
  await installMapTestRoutes(context)
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: unknown, error: unknown) => {
          if (typeof error === "function") error({ code: 1 })
        },
      },
    })
  })
  const page = await context.newPage()
  await page.goto("/")
  await expect(page.locator('[data-location-state="denied"]')).toBeVisible()
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())
  const geometry = await page.evaluate(() => {
    const location = document.querySelector<HTMLElement>('[data-location-state="denied"]')
    const locate = document.querySelector<HTMLElement>('[aria-label="현재 위치 다시 찾기"]')
    const tray = document.querySelector<HTMLElement>("[aria-label='검색 결과 패널']")
    const toggle = document.querySelector<HTMLElement>("[aria-expanded='true']")
    if (location === null || locate === null || tray === null || toggle === null)
      throw new Error("denied location geometry target missing")
    const locationRect = location.getBoundingClientRect()
    const locateRect = locate.getBoundingClientRect()
    const toggleRect = toggle.getBoundingClientRect()
    const toggleHit = document.elementFromPoint(
      toggleRect.left + toggleRect.width / 2,
      toggleRect.top + toggleRect.height / 2,
    )
    return {
      cssViewport: { height: window.innerHeight, width: window.innerWidth },
      locationFullyAboveTray: locationRect.bottom <= tray.getBoundingClientRect().top,
      locationFullyClearOfLocate: locationRect.right <= locateRect.left,
      locationLive: location.tagName === "OUTPUT",
      locationRect: locationRect.toJSON(),
      toggleTopmost: toggle === toggleHit || toggle.contains(toggleHit),
    }
  })
  expect(geometry.cssViewport).toEqual({ height: 406, width: 188 })
  expect(geometry.locationFullyAboveTray).toBe(true)
  expect(geometry.locationFullyClearOfLocate).toBe(true)
  expect(geometry.locationLive).toBe(true)
  expect(geometry.toggleTopmost).toBe(true)
  await page.screenshot({ path: testInfo.outputPath("zoom-200-denied-375x812.png") })
  await testInfo.attach("zoom-200-denied-geometry", {
    body: Buffer.from(JSON.stringify(geometry, null, 2)),
    contentType: "application/json",
  })
  await context.close()
})
