import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { Page, TestInfo } from "@playwright/test"
import { expect, test } from "./map-test"

const TEST_ID = "F3-R35-motion-phases"
const ROW_ID = "R35"
const MANIFEST_REF = "R35/manifest.json"
const TRIGGER_NAME = "새싹 네모식당 상세 보기"
const VIEWPORTS = [
  { height: 812, name: "375x812", width: 375 },
  { height: 1024, name: "768x1024", width: 768 },
  { height: 800, name: "1280x800", width: 1280 },
] as const
type Frame = "rest" | "opening" | "open" | "closing" | "closed"
type DetailPhase = "closed" | "opening" | "open" | "closing"
type Viewport = (typeof VIEWPORTS)[number]
type Geometry = Readonly<
  Record<"bottom" | "height" | "left" | "right" | "top" | "width", number> &
    Record<"opacity" | "transform", string>
>
type Observation = Readonly<{
  detailCount: number
  detailHeadingInViewport: boolean
  focusedAccessibleName: string
  geometry: Geometry | null
  mapPhase: DetailPhase
  observedPhase: DetailPhase
  transitionActive: boolean
}>
type Receipt = Observation &
  Readonly<{
    buildId: string
    capturedAt: string
    frame: Frame
    manifestRef: typeof MANIFEST_REF
    rowId: typeof ROW_ID
    screenshotSha256: string
    sourceSha256: string
    testId: typeof TEST_ID
    viewport: Viewport
  }>
class InvalidDetailPhaseError extends Error {}
const digest = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex")
const sha256 = async (path: string | URL): Promise<string> => digest(await readFile(path))
const phase = (value: string | null): DetailPhase => {
  switch (value) {
    case "closed":
    case "opening":
    case "open":
    case "closing":
      return value
    default:
      throw new InvalidDetailPhaseError(`Unexpected detail phase: ${value ?? "missing"}`)
  }
}
const observe = async (page: Page): Promise<Observation> => {
  const raw = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(
      "[data-detail-phase]:not([data-testid='map-stage'])",
    )
    const map = document.querySelector("[data-testid='map-stage']")
    const heading = document.querySelector<HTMLElement>("#place-detail-title")
    const rect = surface?.getBoundingClientRect()
    const headingRect = heading?.getBoundingClientRect()
    const style = surface === null ? null : getComputedStyle(surface)
    const active = document.activeElement
    return {
      detailCount: document.querySelectorAll("[data-testid='place-detail']").length,
      detailHeadingInViewport:
        headingRect !== undefined &&
        headingRect.top < window.innerHeight &&
        headingRect.bottom > 0 &&
        headingRect.left < window.innerWidth &&
        headingRect.right > 0,
      focusedAccessibleName:
        active instanceof HTMLElement
          ? (active.getAttribute("aria-label") ?? active.textContent?.trim() ?? "")
          : "",
      geometry:
        rect === undefined || style === null
          ? null
          : {
              bottom: rect.bottom,
              height: rect.height,
              left: rect.left,
              opacity: style.opacity,
              right: rect.right,
              top: rect.top,
              transform: style.transform,
              width: rect.width,
            },
      mapPhase: map?.getAttribute("data-detail-phase") ?? null,
      observedPhase:
        surface?.getAttribute("data-detail-phase") ??
        map?.getAttribute("data-detail-phase") ??
        null,
      transitionActive:
        surface?.getAnimations().some((animation) => animation.playState === "running") ?? false,
    }
  })
  return { ...raw, mapPhase: phase(raw.mapPhase), observedPhase: phase(raw.observedPhase) }
}

const assertFrame = (frame: Frame, value: Observation): void => {
  const opacity = Number(value.geometry?.opacity)
  const expected = frame === "rest" || frame === "closed" ? "closed" : frame
  expect(value.observedPhase).toBe(expected)
  expect(value.mapPhase).toBe(expected)
  switch (frame) {
    case "rest":
    case "closed":
      expect(value.detailCount).toBe(0)
      expect(value.detailHeadingInViewport).toBe(false)
      expect(value.focusedAccessibleName).toBe(TRIGGER_NAME)
      expect(value.geometry).toBeNull()
      return
    case "opening":
    case "closing":
      expect(value.detailCount).toBe(1)
      expect(value.transitionActive).toBe(true)
      expect(opacity).toBeGreaterThan(0)
      expect(opacity).toBeLessThan(1)
      expect(value.geometry?.transform).not.toBe("none")
      return
    case "open":
      expect(value.detailCount).toBe(1)
      expect(value.detailHeadingInViewport).toBe(true)
      expect(value.transitionActive).toBe(false)
      expect(opacity).toBe(1)
      expect(value.geometry?.transform).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
      return
  }
}

const capture = async (
  frame: Frame,
  page: Page,
  sourceSha256: string,
  testInfo: TestInfo,
  viewport: Viewport,
): Promise<Receipt> => {
  const observation = await observe(page)
  assertFrame(frame, observation)
  const screenshotPath = testInfo.outputPath(`R35/${viewport.name}-${frame}.png`)
  const receiptPath = testInfo.outputPath(`R35/${viewport.name}-${frame}.json`)
  await mkdir(dirname(screenshotPath), { recursive: true })
  const screenshot = await page.screenshot({ fullPage: false })
  const receipt: Receipt = {
    ...observation,
    buildId: process.env["F3_BUILD_ID"] ?? "local-dev",
    capturedAt: new Date().toISOString(),
    frame,
    manifestRef: MANIFEST_REF,
    rowId: ROW_ID,
    screenshotSha256: digest(screenshot),
    sourceSha256,
    testId: TEST_ID,
    viewport,
  }
  const receiptBody = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`)
  await Promise.all([writeFile(screenshotPath, screenshot), writeFile(receiptPath, receiptBody)])
  await testInfo.attach(`${ROW_ID}-${viewport.name}-${frame}.png`, {
    body: screenshot,
    contentType: "image/png",
  })
  await testInfo.attach(`${ROW_ID}-${viewport.name}-${frame}.json`, {
    body: receiptBody,
    contentType: "application/json",
  })
  return receipt
}

const waitForInFlight = async (page: Page, expected: "opening" | "closing"): Promise<void> => {
  await expect
    .poll(async () => {
      const value = await observe(page)
      const opacity = Number(value.geometry?.opacity)
      return (
        value.observedPhase === expected &&
        value.mapPhase === expected &&
        value.transitionActive &&
        opacity > 0 &&
        opacity < 1
      )
    })
    .toBe(true)
}

test.describe.configure({ retries: 0 })
test("R35 phase-bound lifecycle attaches exact bytes", async ({ context, page }, testInfo) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
  const sourceSha256 = await sha256(new URL("./f3-r35-motion-phases.spec.ts", import.meta.url))
  const receipts: Receipt[] = []
  const pairs = [
    ["rest", "opening"],
    ["opening", "open"],
    ["open", "closing"],
    ["closing", "closed"],
  ] as const
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)
    await page.goto("/")
    await expect(page.getByText("NAVER 지도 연결됨")).toBeVisible()
    const trigger = page.getByRole("button", { name: TRIGGER_NAME })
    await trigger.focus()
    await expect(trigger).toBeFocused()
    await expect(trigger).toBeVisible()
    const frames = new Map<Frame, Receipt>()
    const record = async (frame: Frame): Promise<void> => {
      const receipt = await capture(frame, page, sourceSha256, testInfo, viewport)
      receipts.push(receipt)
      frames.set(frame, receipt)
    }
    await record("rest")
    await trigger.click()
    await waitForInFlight(page, "opening")
    await record("opening")
    await expect
      .poll(() => observe(page))
      .toMatchObject({
        mapPhase: "open",
        observedPhase: "open",
        transitionActive: false,
      })
    await record("open")
    await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
    await waitForInFlight(page, "closing")
    await record("closing")
    await expect(page.getByTestId("place-detail")).toHaveCount(0)
    await expect(page.getByTestId("map-stage")).toHaveAttribute("data-detail-phase", "closed")
    await expect(trigger).toBeFocused()
    await expect(trigger).toBeVisible()
    await record("closed")
    for (const [before, after] of pairs)
      expect(frames.get(before)?.screenshotSha256).not.toBe(frames.get(after)?.screenshotSha256)
  }
  const manifest = Buffer.from(
    `${JSON.stringify({ buildId: process.env["F3_BUILD_ID"] ?? "local-dev", receipts, rowId: ROW_ID, sourceSha256, testId: TEST_ID }, null, 2)}\n`,
  )
  const manifestPath = testInfo.outputPath(MANIFEST_REF)
  await writeFile(manifestPath, manifest)
  await testInfo.attach("R35-manifest.json", { body: manifest, contentType: "application/json" })
})
