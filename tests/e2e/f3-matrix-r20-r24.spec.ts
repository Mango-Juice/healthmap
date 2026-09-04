import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { Page, TestInfo } from "@playwright/test"
import { expect, test } from "./map-test"

test.describe.configure({ retries: 0 })

const sha256 = async (path: string | URL): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex")

const capture = async (page: Page, testInfo: TestInfo, id: string, observed: unknown) => {
  const png = testInfo.outputPath(`attach/${id}.png`)
  const json = testInfo.outputPath(`attach/${id}.json`)
  await mkdir(dirname(png), { recursive: true })
  await page.screenshot({ path: png, fullPage: false })
  const errors: readonly string[] = []
  const data = {
    rowId: id,
    testId: testInfo.title,
    buildId: process.env["F3_BUILD_ID"] ?? "local-dev",
    sourceRef: "tests/e2e/f3-matrix-r20-r24.spec.ts",
    sourceSha256: await sha256(new URL("./f3-matrix-r20-r24.spec.ts", import.meta.url)),
    fullManifestRef: ".omo/evidence/f3-final/surface-matrix.json",
    capturedAt: new Date().toISOString(),
    url: page.url(),
    viewport: page.viewportSize(),
    observed,
    screenshotSha256: await sha256(png),
    errors,
  }
  await writeFile(json, `${JSON.stringify(data, null, 2)}\n`)
  await testInfo.attach(`${id}.png`, { contentType: "image/png", path: png })
  await testInfo.attach(`${id}.json`, { contentType: "application/json", path: json })
}

test("R20 canonical official detail mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/places/test-sprout-square")
  const detail = page.getByTestId("place-detail")
  await expect(page.locator("[data-detail-phase='open'][aria-label='장소 상세']")).toBeVisible()
  await expect(detail.getByRole("heading", { name: "새싹 네모식당" })).toBeFocused()
  await detail.getByRole("heading", { name: "메뉴", exact: true }).scrollIntoViewIfNeeded()
  await expect(detail.getByRole("region", { name: "건강식 메뉴" })).toContainText("초록 그릇")
  await expect(detail).not.toContainText(/공식 메뉴|검증 근거|2026-08-14/)
  await expect(detail.getByRole("link", { name: "네이버에서 보기" })).toHaveAttribute(
    "href",
    "https://map.naver.com/p/entry/place/1",
  )
  const evidence = detail.locator("a").first()
  await evidence.scrollIntoViewIfNeeded()
  await expect(evidence).toBeVisible()
  await capture(page, testInfo, "R20", {
    consumerMenuVisible: true,
    links: await detail.locator("a").count(),
    headingFocused: true,
  })
})

test("R21 canonical detail tablet inline pane", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto("/places/test-sprout-square")
  const detail = page.getByTestId("place-detail")
  const surface = page.locator("[data-detail-phase='open'][aria-label='장소 상세']")
  await expect(surface).toBeVisible()
  const geometry = await surface.evaluate((element) => {
    const r = element.getBoundingClientRect()
    const center = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return {
      width: r.width,
      left: r.left,
      right: r.right,
      viewport: innerWidth,
      inViewport: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
      topmost: center === element || element.contains(center),
    }
  })
  expect(geometry.width).toBeGreaterThan(351.5)
  expect(geometry.width).toBeLessThan(352.5)
  expect(geometry.inViewport).toBe(true)
  expect(geometry.topmost).toBe(true)
  await expect(detail.getByRole("region", { name: "건강식 메뉴" })).toContainText("초록 그릇")
  await expect(detail).not.toContainText(/공식 메뉴|검증 근거|2026-08-14/)
  await expect(detail.getByRole("link", { name: "네이버에서 보기" })).toHaveAttribute(
    "href",
    "https://map.naver.com/p/entry/place/1",
  )
  await capture(page, testInfo, "R21", geometry)
})

test("R22 desktop direct open and canonical share", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException("blocked")) },
    })
  })
  await page.goto("/places/test-sprout-square")
  const canonicalUrl = new URL("/places/test-sprout-square", page.url()).toString()
  await expect(page).toHaveURL(canonicalUrl)
  const detail = page.getByTestId("place-detail")
  await expect(detail.getByRole("heading", { name: "새싹 네모식당" })).toBeVisible()
  await page.getByRole("button", { name: "공유", exact: true }).click()
  const manualUrl = page.getByLabel("공유 URL")
  await expect(manualUrl).toHaveValue(/\/places\/test-sprout-square$/)
  await page.getByRole("button", { name: "공유", exact: true }).click()
  await expect(manualUrl).toHaveCount(1)
  await page.getByRole("button", { name: "URL 선택" }).click()
  const geometry = await manualUrl.evaluate((element) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement))
      throw new Error("R22 manual share control missing")
    const body = element.closest("[data-testid='place-detail-body']")
    const detailElement = element.closest("[data-testid='place-detail']")
    if (!(body instanceof HTMLElement) || !(detailElement instanceof HTMLElement))
      throw new Error("R22 detail geometry missing")
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      bodyHorizontalOverflow: body.scrollWidth > body.clientWidth,
      bodyOverflowY: getComputedStyle(body).overflowY,
      control: {
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        height: rect.height,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
        width: rect.width,
      },
      detailHorizontalOverflow: detailElement.scrollWidth > detailElement.clientWidth,
      documentHorizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      overflowWrap: style.overflowWrap,
      selectionEnd: element.selectionEnd,
      selectionStart: element.selectionStart,
      tagName: element.tagName,
      valueLength: element.value.length,
      whiteSpace: style.whiteSpace,
    }
  })
  await capture(page, testInfo, "R22", {
    canonicalUrl: page.url(),
    geometry,
    shareUrl: await manualUrl.inputValue(),
  })
  expect(geometry.tagName).toBe("TEXTAREA")
  expect(geometry.control.width).toBeGreaterThanOrEqual(44)
  expect(geometry.control.height).toBeGreaterThanOrEqual(44)
  expect(geometry.control.scrollWidth).toBeLessThanOrEqual(geometry.control.clientWidth + 1)
  expect(geometry.control.scrollHeight).toBeLessThanOrEqual(geometry.control.clientHeight + 1)
  expect(geometry.documentHorizontalOverflow).toBe(false)
  expect(geometry.detailHorizontalOverflow).toBe(false)
  expect(geometry.bodyHorizontalOverflow).toBe(false)
  expect(geometry.bodyOverflowY).toBe("auto")
  expect(geometry.selectionStart).toBe(0)
  expect(geometry.selectionEnd).toBe(geometry.valueLength)
})

test("R24 canonical shared detail remains while the applied area excludes its marker", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/places/test-rainbow-bowl")
  const heading = page.getByRole("heading", { name: "무지개 한그릇 연구소" })
  await expect(heading).toBeVisible()
  await expect(page.getByText("NAVER 지도 연결됨")).toBeVisible()
  const applyArea = async (west: number): Promise<void> => {
    await page.evaluate((west) => {
      const maps: unknown = Reflect.get(window, "__healthMapTestMaps")
      if (!Array.isArray(maps)) throw new TypeError("Test map unavailable")
      const map: unknown = maps.at(-1)
      if (typeof map !== "object" || map === null) throw new TypeError("Test map unavailable")
      const setBounds: unknown = Reflect.get(map, "setTestBounds")
      if (typeof setBounds !== "function") throw new TypeError("Test bounds unavailable")
      Reflect.apply(setBounds, map, [
        { latitude: 37.49, longitude: west },
        { latitude: 37.51, longitude: 127.05 },
      ])
    }, west)
    await page.getByRole("button", { name: "이 지역 검색" }).click()
  }
  await applyArea(127.02)
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
  await applyArea(127.029)
  await expect(page.locator("[data-detail-phase='open'][aria-label='장소 상세']")).toBeVisible()
  await expect(heading).toBeVisible()
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(3)
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(3)
  expect(
    await page
      .locator('[data-test-naver-marker="true"]')
      .evaluateAll((markers) => markers.map((marker) => marker.getAttribute("aria-label")).sort()),
  ).toEqual(["새싹 네모식당", "균형 실험실 식탁", "잎사귀 가상 테이블"].sort())
  await expect(page).toHaveURL("/places/test-rainbow-bowl")
  await capture(page, testInfo, "R24", {
    detailVisible: true,
    markers: await page.locator('[data-test-naver-marker="true"]').count(),
    url: page.url(),
  })
})
