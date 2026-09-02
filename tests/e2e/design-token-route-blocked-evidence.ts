import { createHash } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Page } from "@playwright/test"
import type { Mode } from "./design-token-route-provenance"

type Bounds = Readonly<{ height: number; width: number; x: number; y: number }>

const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex")

export const writeBlockedShowcaseEvidence = async (
  page: Page,
  mode: Mode,
  sourceManifestSha256: string,
  stressBounds: Bounds,
): Promise<void> => {
  const directory = process.env["DS01_EVIDENCE_DIR"]?.trim()
  if (!directory) return
  await page
    .getByText("https://example.com/this-is-an-intentionally-unbroken-accessibility-stress-string")
    .scrollIntoViewIfNeeded()
  const screenshot = await page.screenshot({ fullPage: false })
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    scrollY: window.scrollY,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  const receipt = {
    capture: "showcase-188x406-at-2x-url-containment-failure",
    cssViewport: { height: mode.height, width: mode.width },
    deviceScaleFactor: mode.deviceScaleFactor,
    geometry,
    selector:
      ".unbrokenText (https://example.com/this-is-an-intentionally-unbroken-accessibility-stress-string)",
    screenshotSha256: sha256(screenshot),
    sourceManifestSha256,
    stressBounds: { ...stressBounds, right: stressBounds.x + stressBounds.width },
    url: new URL(page.url()).pathname,
  }
  await Promise.all([
    writeFile(join(directory, "showcase-188x406-at-2x-overflow.png"), screenshot),
    writeFile(
      join(directory, "showcase-188x406-at-2x-overflow.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    ),
  ])
}
