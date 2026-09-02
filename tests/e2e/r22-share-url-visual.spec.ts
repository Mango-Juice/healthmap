import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import type { Page, TestInfo } from "@playwright/test"
import { expect, test } from "./map-test"

const viewports = [
  { label: "mobile", width: 375, height: 812 },
  { label: "desktop", width: 1280, height: 800 },
] as const

const sha256 = async (path: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex")

const openManualShare = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException("blocked")) },
    })
  })
  await page.goto("/places/test-sprout-square")
  await expect(page.getByRole("heading", { name: "새싹 네모식당" })).toBeVisible()
  await page.getByRole("button", { exact: true, name: "공유" }).click()
  await expect(page.getByLabel("공유 URL")).toBeVisible()
  await page.getByRole("button", { exact: true, name: "공유" }).click()
  await expect(page.getByLabel("공유 URL")).toHaveCount(1)
  await page.getByRole("button", { name: "URL 선택" }).click()
}

const readGeometry = async (page: Page) =>
  page.getByLabel("공유 URL").evaluate((element) => {
    if (!(element instanceof HTMLTextAreaElement))
      throw new Error("R22 share URL is not a textarea")
    const body = element.closest("[data-testid='place-detail-body']")
    const detail = element.closest("[data-testid='place-detail']")
    if (!(body instanceof HTMLElement) || !(detail instanceof HTMLElement))
      throw new Error("R22 detail geometry missing")
    const rect = element.getBoundingClientRect()
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
      detailHorizontalOverflow: detail.scrollWidth > detail.clientWidth,
      documentHorizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      selectionEnd: element.selectionEnd,
      selectionStart: element.selectionStart,
      textareaOverflowY: getComputedStyle(element).overflowY,
      value: element.value,
      whiteSpace: getComputedStyle(element).whiteSpace,
    }
  })

const recordEvidence = async (
  page: Page,
  testInfo: TestInfo,
  label: string,
  geometry: Awaited<ReturnType<typeof readGeometry>>,
): Promise<void> => {
  const screenshot = testInfo.outputPath(`R22-${label}.png`)
  const state = testInfo.outputPath(`R22-${label}.json`)
  await page.screenshot({ path: screenshot })
  await writeFile(
    state,
    `${JSON.stringify(
      {
        buildId: process.env["F3_BUILD_ID"] ?? "unbound",
        geometry,
        screenshotSha256: await sha256(screenshot),
        viewport: page.viewportSize(),
      },
      null,
      2,
    )}\n`,
  )
  await testInfo.attach(`R22-${label}.png`, { contentType: "image/png", path: screenshot })
  await testInfo.attach(`R22-${label}.json`, { contentType: "application/json", path: state })
}

for (const viewport of viewports) {
  test(`R22 ${viewport.label} manual share URL wraps without a second scroll owner`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    await openManualShare(page)
    const manualUrl = page.getByLabel("공유 URL")
    const geometry = await readGeometry(page)
    await recordEvidence(page, testInfo, viewport.label, geometry)

    expect(geometry.control.width).toBeGreaterThanOrEqual(44)
    expect(geometry.control.height).toBeGreaterThanOrEqual(44)
    expect(geometry.control.scrollWidth).toBeLessThanOrEqual(geometry.control.clientWidth + 1)
    expect(geometry.control.scrollHeight).toBeLessThanOrEqual(geometry.control.clientHeight + 1)
    expect(geometry.documentHorizontalOverflow).toBe(false)
    expect(geometry.detailHorizontalOverflow).toBe(false)
    expect(geometry.bodyHorizontalOverflow).toBe(false)
    expect(geometry.bodyOverflowY).toBe("auto")
    expect(geometry.textareaOverflowY).toBe("clip")
    expect(geometry.selectionStart).toBe(0)
    expect(geometry.selectionEnd).toBe(geometry.value.length)
    expect(new URL(geometry.value).pathname).toBe("/places/test-sprout-square")
    await expect(manualUrl).toBeFocused()
    await expect(page.getByRole("button", { name: "URL 선택" })).toBeVisible()
  })
}
