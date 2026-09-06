import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { expect, test } from "./map-test"

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: {
              accuracy: 5,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              latitude: 37.5007,
              longitude: 127.0328,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: Date.now(),
            toJSON: () => ({}),
          }),
      },
    })
  })
})

type Row = { readonly id: string; readonly width: number; readonly height: number }
const rows: readonly Row[] = [
  { id: "R01", width: 375, height: 812 },
  { id: "R02", width: 768, height: 1024 },
  { id: "R03", width: 1280, height: 800 },
]
const sourcePath = new URL("./f3-matrix-r01-r09-default.spec.ts", import.meta.url)
const sha256 = async (path: string | URL): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex")

for (const row of rows) {
  test(`${row.id} row-owned default surface`, async ({ page }, testInfo) => {
    const consoleErrors: string[] = []
    page.on("pageerror", (error) => consoleErrors.push(error.message))
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    await page.setViewportSize({ width: row.width, height: row.height })
    await page.goto("/")
    const resultCount = page.getByLabel("검색 결과 수")
    await expect(resultCount).toHaveText(/^\d+곳 중 \d+곳$/u)
    const reportedCounts = /^([0-9]+)곳 중 ([0-9]+)곳$/u.exec(await resultCount.innerText())
    if (!reportedCounts) throw new TypeError("Visible Pilot result count is unavailable")
    const total = Number(reportedCounts[1])
    const visible = Number(reportedCounts[2])
    const resultItems = page.locator("[data-pilot-place-id]")
    expect(total).toBeGreaterThanOrEqual(visible)
    expect(visible).toBeGreaterThan(0)
    await expect(resultItems).toHaveCount(visible)
    await expect(page.locator("[data-test-naver-marker='true']")).toHaveCount(visible)
    await expect(page.getByRole("application", { name: "NAVER 건강식 지도" })).toBeVisible()
    const observed = await page.evaluate(() => {
      const tray = document.querySelector<HTMLElement>("aside[aria-label='건강식 검색 결과']")
      const map = document.querySelector<HTMLElement>("[data-testid='pilot-map-stage']")
      const markers = document.querySelectorAll("[data-test-naver-marker='true']").length
      const items = document.querySelectorAll("[data-pilot-place-id]").length
      const controls = [...document.querySelectorAll<HTMLElement>("button")]
        .filter((element) => element.getClientRects().length > 0)
        .filter((element) => element.closest("[data-testid='pilot-naver-map']") === null)
      if (tray === null || map === null) throw new TypeError("row surface missing")
      const trayRect = tray.getBoundingClientRect()
      const mapRect = map.getBoundingClientRect()
      return {
        controlsMeet44: controls.every((element) => {
          const rect = element.getBoundingClientRect()
          return rect.width >= 44 && rect.height >= 44
        }),
        documentOverflow: document.documentElement.scrollWidth > window.innerWidth,
        items,
        mapDominant: mapRect.width * mapRect.height > trayRect.width * trayRect.height,
        markers,
        trayGeometry: { height: trayRect.height, width: trayRect.width },
        viewport: { height: window.innerHeight, width: window.innerWidth },
      }
    })
    expect(observed.items).toBe(visible)
    expect(observed.markers).toBe(visible)
    expect(observed.controlsMeet44).toBe(true)
    expect(observed.documentOverflow).toBe(false)
    expect(observed.mapDominant).toBe(true)
    const png = testInfo.outputPath(`${row.id}.png`)
    await page.screenshot({ path: png, fullPage: false })
    const metadata = {
      artifact: `${row.id}.png`,
      consoleErrors,
      captureTimestamp: new Date().toISOString(),
      observed,
      rowId: row.id,
      screenshotSha256: await sha256(png),
      screenshotSha: await sha256(png),
      sourceSha256: await sha256(sourcePath),
      testId: testInfo.testId,
      url: page.url(),
    }
    const json = testInfo.outputPath(`${row.id}.json`)
    await writeFile(json, `${JSON.stringify(metadata, null, 2)}\n`)
    await testInfo.attach(`${row.id}.png`, { contentType: "image/png", path: png })
    await testInfo.attach(`${row.id}.json`, { contentType: "application/json", path: json })
    expect(metadata.screenshotSha256).toMatch(/^[a-f0-9]{64}$/)
  })
}
