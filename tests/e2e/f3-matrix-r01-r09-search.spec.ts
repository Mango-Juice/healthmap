import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import type { Page, TestInfo } from "@playwright/test"
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

const sourcePath = new URL("./f3-matrix-r01-r09-search.spec.ts", import.meta.url)
const sha256 = async (path: string | URL): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex")

const capture = async (
  rowId: string,
  page: Page,
  testInfo: TestInfo,
  observed: unknown,
  consoleErrors: readonly string[],
): Promise<void> => {
  const png = testInfo.outputPath(`${rowId}.png`)
  await page.screenshot({ animations: "disabled", path: png, fullPage: false })
  const metadata = {
    artifact: `${rowId}.png`,
    buildId: process.env["F3_BUILD_ID"] ?? "S2m8_RnjLdQT5-_DHb3I2",
    consoleErrors,
    captureTimestamp: new Date().toISOString(),
    observed,
    rowId,
    screenshotSha256: await sha256(png),
    screenshotSha: await sha256(png),
    sourceSha256: await sha256(sourcePath),
    sourceManifestReference:
      ".omo/evidence/f3-final/surface-matrix.json#baseline.sourceManifestSha256",
    sourceManifestSha256: "227f168eb3c1a35e66d9c4f85dbe29f9ff82270e46f07ac315df27d83492b107",
    testId: testInfo.testId,
    url: page.url(),
  }
  const json = testInfo.outputPath(`${rowId}.json`)
  await writeFile(json, `${JSON.stringify(metadata, null, 2)}\n`)
  await testInfo.attach(`${rowId}.png`, { contentType: "image/png", path: png })
  await testInfo.attach(`${rowId}.json`, { contentType: "application/json", path: json })
}

test("R04 typed search produces one result and marker", async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await page.getByRole("searchbox", { name: "장소와 메뉴 검색" }).fill("초록 그릇")
  await expect(page.getByRole("status", { name: "검색 결과 수" })).toHaveText("1곳")
  await expect(page.locator("[data-test-naver-marker='true']")).toHaveCount(1)
  const observed = {
    items: await page.getByRole("list", { name: "검색 결과" }).getByRole("listitem").count(),
    markers: await page.locator("[data-test-naver-marker='true']").count(),
    status: await page.getByRole("status", { name: "검색 결과 수" }).innerText(),
  }
  expect(observed).toEqual({ items: 1, markers: 1, status: "1곳" })
  await capture("R04", page, testInfo, observed, consoleErrors)
})
test("R05 normalized search and plant tag produce two results", async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto("/")
  await page.getByRole("searchbox", { name: "장소와 메뉴 검색" }).fill("  서울   강남구  ")
  const plantFilter = page.getByRole("combobox", { name: "식사 형태·선택" })
  await plantFilter.selectOption("plant_based")
  await expect(plantFilter).toHaveValue("plant_based")
  await expect(plantFilter.locator("option:checked")).toHaveText("채식 메뉴")
  await expect(page.getByRole("status", { name: "검색 결과 수" })).toHaveText("2곳")
  await expect(page.locator("[data-test-naver-marker='true']")).toHaveCount(2)
  const observed = {
    selectedFilter: await plantFilter.inputValue(),
    items: await page.getByRole("list", { name: "검색 결과" }).getByRole("listitem").count(),
    markers: await page.locator("[data-test-naver-marker='true']").count(),
    status: await page.getByRole("status", { name: "검색 결과 수" }).innerText(),
    resultNames: await page
      .getByRole("list", { name: "검색 결과" })
      .getByRole("listitem")
      .allTextContents(),
    markerCoordinates: await page
      .locator("[data-test-naver-marker='true']")
      .evaluateAll((markers) =>
        markers.map((marker) => ({
          latitude: marker.getAttribute("data-latitude"),
          longitude: marker.getAttribute("data-longitude"),
        })),
      ),
  }
  expect(observed).toMatchObject({
    selectedFilter: "plant_based",
    items: 2,
    markers: 2,
    status: "2곳",
  })
  expect(observed.resultNames).toEqual([
    expect.stringContaining("잎사귀 가상 테이블"),
    expect.stringContaining("구름 도시락 공방"),
  ])
  expect(observed.markerCoordinates).toEqual([
    { latitude: "37.4935", longitude: "127.041" },
    { latitude: "37.5079", longitude: "127.0224" },
  ])
  await capture("R05", page, testInfo, observed, consoleErrors)
})
test("R06 typed missing search produces empty state", async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await page.getByRole("searchbox", { name: "장소와 메뉴 검색" }).fill("없는 메뉴")
  await expect(page.getByRole("status", { name: "검색 결과 수" })).toHaveText("0곳")
  await expect(page.locator("[data-test-naver-marker='true']")).toHaveCount(0)
  const observed = {
    emptyText: await page.getByText("검색 결과가 없습니다.").innerText(),
    items: await page.getByRole("list", { name: "검색 결과" }).getByRole("listitem").count(),
    markers: await page.locator("[data-test-naver-marker='true']").count(),
    status: await page.getByRole("status", { name: "검색 결과 수" }).innerText(),
  }
  expect(observed).toEqual({
    emptyText: "검색 결과가 없습니다.",
    items: 0,
    markers: 0,
    status: "0곳",
  })
  await capture("R06", page, testInfo, observed, consoleErrors)
})
