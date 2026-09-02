import { type Browser, type BrowserContext, expect } from "@playwright/test"
import {
  type CapturePhase,
  digest,
  type Mode,
  type Receipt,
  ReceiptSchema,
  type RouteName,
} from "./design-token-route-provenance"
import { routeState } from "./design-token-route-states"

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

type CaptureInput = Readonly<{
  baseURL: string | undefined
  browser: Browser
  mode: Mode
  phase: CapturePhase
  route: RouteName
  sourceManifestSha256: string
}>

const newContext = (
  browser: Browser,
  baseURL: string | undefined,
  mode: Mode,
): Promise<BrowserContext> =>
  browser.newContext(
    baseURL === undefined
      ? {
          deviceScaleFactor: mode.deviceScaleFactor,
          viewport: { height: mode.height, width: mode.width },
        }
      : {
          baseURL,
          deviceScaleFactor: mode.deviceScaleFactor,
          viewport: { height: mode.height, width: mode.width },
        },
  )

const pngDimensions = (screenshot: Buffer): Readonly<{ height: number; width: number }> => {
  if (screenshot.length < 24 || !screenshot.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE))
    throw new Error("DS-01 screenshot is not a PNG")
  return { height: screenshot.readUInt32BE(20), width: screenshot.readUInt32BE(16) }
}

export const captureRoute = async (
  input: CaptureInput,
): Promise<Readonly<{ receipt: Receipt; screenshot: Buffer }>> => {
  const context = await newContext(input.browser, input.baseURL, input.mode)
  try {
    const page = await context.newPage()
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("pageerror", (error) => pageErrors.push(error.message))
    await page.emulateMedia({ reducedMotion: "reduce" })
    const route = await routeState(page, input.route, input.mode, input.sourceManifestSha256)
    expect(route.status).toBe(input.route === "not-found" ? 404 : 200)
    const targets = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("button, a[href], [role='switch']")]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => ({
          name: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
          rect: element.getBoundingClientRect().toJSON(),
        })),
    )
    expect(targets.length).toBeGreaterThan(0)
    expect(targets.every((target) => target.rect.width >= 44 && target.rect.height >= 44)).toBe(
      true,
    )
    const geometry = await page.evaluate(() => ({
      bodyScrollHeight: document.body.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      clientWidth: document.documentElement.clientWidth,
      documentScrollHeight: document.documentElement.scrollHeight,
      horizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      verticalScroll: window.scrollY,
    }))
    expect(geometry.horizontalOverflow).toBe(0)
    const unexpectedConsoleErrors = consoleErrors.filter(
      (message) =>
        input.route !== "not-found" ||
        message !==
          "Failed to load resource: the server responded with a status of 404 (Not Found)",
    )
    expect(unexpectedConsoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
    const screenshot = await page.screenshot({ fullPage: false })
    const physicalPixels = pngDimensions(screenshot)
    expect(physicalPixels).toEqual({
      height: input.mode.height * input.mode.deviceScaleFactor,
      width: input.mode.width * input.mode.deviceScaleFactor,
    })
    const url = new URL(page.url()).pathname
    if (input.route === "not-found") {
      await page.getByRole("link", { name: "건강식 지도 돌아가기" }).press("Enter")
      await expect(page).toHaveURL(/\/$/)
    }
    return {
      receipt: ReceiptSchema.parse({
        ...route,
        consoleErrors,
        deviceScaleFactor: input.mode.deviceScaleFactor,
        geometry,
        id: `${input.route}-${input.mode.name}`,
        pageErrors,
        phase: input.phase,
        physicalPixels,
        reducedMotion: "reduce",
        route: input.route,
        schemaVersion: 1,
        screenshotSha256: digest(screenshot),
        sourceManifestSha256: input.sourceManifestSha256,
        targets,
        unexpectedConsoleErrors,
        url,
        viewport: { height: input.mode.height, width: input.mode.width },
      }),
      screenshot,
    }
  } finally {
    await context.close()
  }
}
