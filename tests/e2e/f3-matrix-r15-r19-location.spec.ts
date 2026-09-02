import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import type { Page, TestInfo } from "@playwright/test"
import { expect, test } from "./map-test"

const viewport = { width: 375, height: 812 } as const
const sourcePath = new URL("./f3-matrix-r15-r19-location.spec.ts", import.meta.url)
const manifestRef = ".omo/evidence/f3-final/surface-matrix.json#baseline.sourceManifestSha256"
const sha256 = async (path: string | URL): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex")
const monitor = (page: Page): string[] => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(`page:${error.message}`))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`)
  })
  return errors
}
const receipt = async (
  rowId: string,
  page: Page,
  testInfo: TestInfo,
  observations: Readonly<Record<string, unknown>>,
  expectedInjected: readonly string[],
  unexpectedConsoleOrPageErrors: readonly string[],
): Promise<void> => {
  const png = testInfo.outputPath(`${rowId}.png`)
  await page.screenshot({ path: png, fullPage: false })
  const value = {
    rowId,
    testId: testInfo.testId,
    buildId: process.env["F3_BUILD_ID"] ?? "unset",
    sourceSha256: await sha256(sourcePath),
    manifestRef,
    capturedAt: new Date().toISOString(),
    screenshotSha256: await sha256(png),
    viewport,
    observations,
    errors: { expectedInjected, unexpectedConsoleOrPageErrors },
  }
  const json = testInfo.outputPath(`${rowId}.json`)
  await writeFile(json, `${JSON.stringify(value, null, 2)}\n`)
  await testInfo.attach(`${rowId}.png`, { contentType: "image/png", path: png })
  await testInfo.attach(`${rowId}.json`, { contentType: "application/json", path: json })
}

test.describe.configure({ retries: 0 })

test("R15 timeout location retains map and retry control", async ({ page }, testInfo) => {
  const errors = monitor(page)
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) =>
          failure({
            code: 3,
            message: "timeout",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          }),
      },
    }),
  )
  await page.setViewportSize(viewport)
  await page.goto("/")
  await expect(page.locator('[data-location-state="timeout"]')).toBeVisible()
  await expect(page.getByRole("button", { name: "현재 위치 다시 찾기" })).toBeVisible()
  await expect(page.getByTestId("map-stage")).toBeVisible()
  expect(errors).toEqual([])
  await receipt(
    "R15",
    page,
    testInfo,
    { timeout: true, mapVisible: true, retryVisible: true },
    ["geolocation:TIMEOUT"],
    errors,
  )
})

test("R16 location states are truthful at inclusive boundaries", async ({ page }, testInfo) => {
  const errors = monitor(page)
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    }),
  )
  await page.setViewportSize(viewport)
  await page.goto("/")
  await expect(page.locator('[data-location-state="requesting"]')).toBeVisible()
  const states = [
    await page.locator('[data-location-state="requesting"]').getAttribute("data-location-state"),
  ]
  const responses = [
    { state: "inside", latitude: 37.5007, longitude: 127.0328 },
    { state: "outside", latitude: 37.6, longitude: 127.1 },
    { state: "inside", latitude: 37.492, longitude: 127.02 },
    { state: "inside", latitude: 37.5085, longitude: 127.0445 },
  ] as const
  for (const response of responses) {
    await page.addInitScript(
      ({ latitude, longitude }) =>
        Object.defineProperty(navigator, "geolocation", {
          configurable: true,
          value: {
            getCurrentPosition: (success: PositionCallback) =>
              success({
                coords: {
                  latitude,
                  longitude,
                  accuracy: 1,
                  altitude: null,
                  altitudeAccuracy: null,
                  heading: null,
                  speed: null,
                  toJSON: () => ({}),
                },
                timestamp: Date.now(),
                toJSON: () => ({}),
              }),
          },
        }),
      response,
    )
    await page.reload()
    await expect(page.locator(`[data-location-state="${response.state}"]`)).toBeVisible()
    states.push(await page.locator("[data-location-state]").getAttribute("data-location-state"))
  }
  const observations = {
    sequence: ["requesting", "inside", "outside", "southwest-boundary", "northeast-boundary"],
    observedStates: states,
    markerCount: await page.locator('[data-test-naver-marker="true"]').count(),
  }
  expect(errors).toEqual([])
  await receipt(
    "R16",
    page,
    testInfo,
    observations,
    ["geolocation:pending-and-coordinates"],
    errors,
  )
})
