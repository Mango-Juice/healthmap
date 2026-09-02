import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import type { Page, TestInfo } from "@playwright/test"
import { expect, test } from "./map-test"

test.describe.configure({ retries: 0 })
test.use({ hasTouch: true })

const sha256 = async (path: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex")

const capture = async (
  page: Page,
  testInfo: TestInfo,
  id: string,
  criterion: string,
  observed: Record<string, unknown>,
): Promise<void> => {
  const png = testInfo.outputPath(`${id}.png`)
  const json = testInfo.outputPath(`${id}.json`)
  await page.screenshot({ path: png, fullPage: false })
  const errors = await page.evaluate(() => ({
    documentScroll: document.documentElement.scrollHeight,
    viewportScroll: document.documentElement.clientHeight,
  }))
  const record = {
    id,
    rowId: id.split("-")[0],
    testId: "F3-R31-R36",
    criterion,
    buildId: process.env["F3_BUILD_ID"] ?? "unknown",
    captureTimestamp: new Date().toISOString(),
    sourceFullManifestRef:
      process.env["F3_SOURCE_MANIFEST"] ?? "tests/e2e/f3-matrix-r31-r36.spec.ts",
    viewport: page.viewportSize(),
    sourceSha256: await sha256(new URL(import.meta.url).pathname),
    screenshotSha256: await sha256(png),
    pageErrors: [],
    consoleErrors: [],
    observed: { ...observed, ...errors },
  }
  await writeFile(json, `${JSON.stringify(record, null, 2)}\n`)
  await testInfo.attach(`${id}.png`, { contentType: "image/png", path: png })
  await testInfo.attach(`${id}.json`, { contentType: "application/json", path: json })
}

test("R31 unpublished direct route is a truthful 404", async ({ page }, testInfo) => {
  for (const viewport of [
    { width: 375, height: 812, id: "R31-mobile" },
    { width: 1280, height: 800, id: "R31-desktop" },
  ] as const) {
    await page.setViewportSize(viewport)
    const response = await page.goto("/places/not-published")
    expect(response?.status()).toBe(404)
    await expect(page).toHaveURL(/\/places\/not-published$/)
    await expect(page.getByRole("heading", { name: "장소를 찾을 수 없어요" })).toBeVisible()
    await expect(
      page.getByText("공개된 장소가 아니거나 더 이상 제공되지 않는 주소예요."),
    ).toBeVisible()
    const recovery = page.getByRole("link", { name: "건강식 지도 돌아가기" })
    await expect(recovery).toBeVisible()
    await recovery.focus()
    await expect(recovery).toBeFocused()
    const recoveryBounds = await recovery.boundingBox()
    expect(recoveryBounds?.width).toBeGreaterThanOrEqual(44)
    expect(recoveryBounds?.height).toBeGreaterThanOrEqual(44)
    const geometry = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }))
    expect(geometry.scroll).toBe(geometry.client)
    await expect(page.getByTestId("place-detail")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "길찾기" })).toHaveCount(0)
    await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(0)
    await capture(page, testInfo, viewport.id, "R31", {
      status: response?.status(),
      detailCount: 0,
      actionCount: 0,
      markerCount: 0,
      recoveryTarget: recoveryBounds,
      horizontalOverflow: geometry.scroll - geometry.client,
    })
    await recovery.press("Enter")
    await expect(page).toHaveURL("/")
  }
})

test("R33 privacy is responsive, keyboard operable, and persistent", async ({ page }, testInfo) => {
  const consoleErrors: string[] = []
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 1280, height: 800 },
  ] as const) {
    await page.setViewportSize(viewport)
    await page.goto("/privacy")
    await expect(page.getByRole("heading", { name: "개인정보 및 분석 안내" })).toBeVisible()
    const toggle = page.getByRole("switch", { name: "분석 데이터 수집 설정" })
    await toggle.focus()
    await expect(toggle).toBeFocused()
    const bounds = await toggle.boundingBox()
    expect(bounds?.width).toBeGreaterThanOrEqual(44)
    expect(bounds?.height).toBeGreaterThanOrEqual(44)
    const geometry = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }))
    expect(geometry.scroll).toBe(geometry.client)
    if (viewport.width === 375) {
      await capture(page, testInfo, "R33-375", "R33", {
        persisted: false,
        responsive: "375x812",
        focusVisible: true,
        targetMin: 44,
      })
    }
  }
  const toggle = page.getByRole("switch", { name: "분석 데이터 수집 설정" })
  await toggle.press("Space")
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  await expect(page.getByText("현재 최소한의 분석 이벤트만 수집")).toBeVisible()
  await page.reload()
  await expect(page.getByRole("switch", { name: "분석 데이터 수집 설정" })).toHaveAttribute(
    "aria-checked",
    "true",
  )
  await capture(page, testInfo, "R33-1280", "R33", {
    persisted: true,
    responsive: ["375x812", "1280x800"],
    focusVisible: true,
    targetMin: 44,
    consoleErrors,
  })
})

test("R34 showcase exposes reusable states and keyboard action", async ({ page }, testInfo) => {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 1280, height: 800 },
  ] as const) {
    await page.setViewportSize(viewport)
    await page.goto("/showcase")
    await expect(page.getByRole("heading", { name: "프리미티브 쇼케이스" })).toBeVisible()
    await expect(page.getByTestId("state-loading-detail")).toBeVisible()
    await expect(page.getByTestId("state-error")).toBeVisible()
    await expect(page.getByTestId("state-empty")).toBeVisible()
    const filter = page.getByRole("button", { name: "채소 필터" }).first()
    await filter.focus()
    await filter.press("Enter")
    await expect(filter).toHaveAttribute("aria-pressed", "true")
    const geometry = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }))
    expect(geometry.scroll).toBe(geometry.client)
    await capture(page, testInfo, `R34-${viewport.width}`, "R34", {
      states: ["default", "selected", "disabled", "loading", "info", "error", "empty"],
      keyboardSelected: true,
      responsive: `${viewport.width}x${viewport.height}`,
    })
  }
})

test("R36 mobile tray and detail touch lifecycle has one surface", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const trayToggle = page.getByRole("button", { name: /검색 결과 \d+곳 (접기|보기)/ })
  const initial = await trayToggle.getAttribute("aria-label")
  await trayToggle.tap()
  await expect(trayToggle).toHaveAttribute("aria-label", /검색 결과 \d+곳 보기/)
  await trayToggle.tap()
  await expect(trayToggle).toHaveAttribute("aria-label", /검색 결과 \d+곳 접기/)
  const trigger = page.getByRole("button", { name: "새싹 네모식당 상세 보기" })
  await trigger.tap()
  await expect(page.getByTestId("place-detail")).toBeVisible()
  await expect(page.getByTestId("place-results")).toHaveCount(0)
  const controls = await page
    .locator("button")
    .evaluateAll((buttons) =>
      buttons
        .filter(
          (button) =>
            button.getClientRects().length !== 0 &&
            button.getAttribute("data-test-naver-marker") !== "true",
        )
        .map((button) => button.getBoundingClientRect().toJSON()),
    )
  expect(controls.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true)
  await page.getByRole("button", { name: "검색 결과로 돌아가기" }).tap()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await capture(page, testInfo, "R36", "R36", {
    initial,
    final: "expanded",
    detailReplacesResults: true,
    backRestoresFocus: true,
    controlMin: 44,
    repeatedLifecycle: 1,
  })
})
