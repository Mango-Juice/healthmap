import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { Page } from "@playwright/test"
import { z } from "zod"
import { observeMap } from "./design-token-map-observe"
import {
  BaselineExistsError,
  BaselineMismatchError,
  CaptureConfigurationError,
  type CaptureFacts,
  type CapturePhase,
  type CaptureReceipt,
  type CaptureState,
  type ErrorRecords,
  type EvidenceSession,
  type SourceManifest,
  TEST_ID,
  type Viewport,
} from "./design-token-map-types"
import { expect } from "./map-test"

const SOURCE_FILES = [
  "app/globals.css",
  "app/layout.tsx",
  "components/map/detail-surface.tsx",
  "components/map/map-discovery-surface.tsx",
  "components/map/map-discovery.module.css",
  "components/map/place-detail.module.css",
  "components/map/place-results.tsx",
  "components/ui/health-map-primitives.module.css",
  "tests/e2e/design-token-map-equivalence.spec.ts",
  "tests/e2e/design-token-map-evidence.ts",
  "tests/e2e/design-token-map-observe.ts",
  "tests/e2e/design-token-map-types.ts",
] as const
const CONSUMED_CSS_FILES = [
  "components/map/map-discovery.module.css",
  "components/map/place-detail.module.css",
  "components/ui/health-map-primitives.module.css",
] as const
const BaselineReceiptSchema = z.object({
  geometry: z.record(z.string(), z.unknown()),
  image: z.object({ height: z.number(), width: z.number() }),
  screenshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  scroll: z.object({
    documentOverflow: z.boolean(),
    overflowingOwners: z.array(z.string()),
    owners: z.array(z.string()),
    regions: z.record(z.string(), z.unknown()),
  }),
  state: z.enum(["discovery", "detail", "detail-reduced-motion", "status-error"]),
  statusError: z
    .object({
      mapScopeSpace8: z.string(),
      maxInlineSize: z.string(),
      referencesSpace8: z.boolean(),
    })
    .nullable(),
  targetSizes: z.array(z.unknown()),
  tokens: z.record(z.string(), z.string()),
  url: z.string(),
  viewport: z.object({ height: z.number(), width: z.number() }),
})

const digest = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex")
const sha256 = async (path: string): Promise<string> => digest(await readFile(path))
const phaseDirectory = (root: string, phase: CapturePhase): string => resolve(root, phase)
const fileName = (state: CaptureState, viewport: Viewport): string => `${state}-${viewport.name}`
const pngDimensions = (
  screenshot: Buffer,
): Readonly<{ readonly height: number; readonly width: number }> => {
  if (screenshot.length < 24 || screenshot.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
    throw new CaptureConfigurationError("DS-01 screenshot is not a PNG")
  return { height: screenshot.readUInt32BE(20), width: screenshot.readUInt32BE(16) }
}
export const createEvidenceSession = async (): Promise<EvidenceSession> => {
  const phase = process.env["DS01_CAPTURE_PHASE"]
  const rootInput = process.env["DS01_EVIDENCE_DIR"]?.trim()
  if (
    (phase !== "before" && phase !== "after") ||
    rootInput === undefined ||
    rootInput.length === 0
  )
    throw new CaptureConfigurationError(
      "DS01_CAPTURE_PHASE must be before or after and DS01_EVIDENCE_DIR must be explicit",
    )
  const directory = phaseDirectory(resolve(process.cwd(), rootInput), phase)
  if (existsSync(directory)) throw new BaselineExistsError("DS-01 baseline already exists")
  const baselineRoot = process.env["DS01_BASELINE_DIR"]?.trim()
  const baselineDirectory =
    phase === "after" && baselineRoot !== undefined && baselineRoot.length > 0
      ? phaseDirectory(resolve(process.cwd(), baselineRoot), "before")
      : null
  if (
    phase === "after" &&
    (baselineDirectory === null || !existsSync(resolve(baselineDirectory, "source-manifest.json")))
  )
    throw new BaselineMismatchError("DS-01 baseline manifest missing or mismatched")
  await mkdir(directory, { recursive: true })
  return { baselineDirectory, directory, phase }
}
export const readCaptureFacts = async (): Promise<CaptureFacts> => {
  const sources = await Promise.all(
    CONSUMED_CSS_FILES.map(async (file) => readFile(resolve(process.cwd(), file), "utf8")),
  )
  const tokenNames = [
    ...new Set(
      sources
        .flatMap((source) =>
          [...source.matchAll(/var\((--hm-[\w-]+)/g)].flatMap((match) =>
            match[1] === undefined ? [] : [match[1]],
          ),
        )
        .concat("--hm-space-8"),
    ),
  ].sort()
  return {
    statusRuleReferencesSpace8:
      sources[0]?.includes("max-inline-size: min(28rem, calc(100% - var(--hm-space-8)))") ?? false,
    tokenNames,
  }
}
export const writeSourceManifest = async (directory: string): Promise<SourceManifest> => {
  const files = await Promise.all(
    SOURCE_FILES.map(async (path) => ({
      path,
      sha256: await sha256(resolve(process.cwd(), path)),
    })),
  )
  const sorted = files.sort((left, right) => left.path.localeCompare(right.path))
  const manifest: SourceManifest = {
    files: sorted,
    sha256: digest(Buffer.from(JSON.stringify({ files: sorted, testId: TEST_ID }))),
    testId: TEST_ID,
  }
  await writeFile(
    resolve(directory, "source-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  return manifest
}
const assertReceipt = (receipt: CaptureReceipt): void => {
  expect(receipt.screenshotSha256).toMatch(/^[a-f0-9]{64}$/)
  expect(receipt.sourceManifestSha256).toMatch(/^[a-f0-9]{64}$/)
  expect(receipt.consoleErrors).toEqual([])
  expect(receipt.pageErrors).toEqual([])
  expect(receipt.scroll.documentOverflow).toBe(false)
  expect(receipt.targetSizes.every((target) => target.width >= 44 && target.height >= 44)).toBe(
    true,
  )
  expect(receipt.image.width).toBe(receipt.viewport.width * receipt.deviceScaleFactor)
  expect(receipt.image.height).toBe(receipt.viewport.height * receipt.deviceScaleFactor)
  if (receipt.state === "detail" || receipt.state === "detail-reduced-motion") {
    expect(receipt.geometry["detail"]).not.toBeNull()
    expect(receipt.scroll.owners).toEqual(["detailBody"])
  }
  if (receipt.state === "status-error") {
    expect(receipt.geometry["error"]).not.toBeNull()
    expect(receipt.statusError?.mapScopeSpace8).toBe("32px")
    expect(receipt.statusError?.maxInlineSize).not.toBe("none")
    expect(receipt.statusError?.referencesSpace8).toBe(true)
  }
}
const assertComputedTokens = (
  baseline: Readonly<Record<string, string>>,
  current: Readonly<Record<string, string>>,
) => {
  const before = { ...baseline }
  const after = { ...current }
  if (before["--hm-space-8"] === "" && after["--hm-space-8"] === "32px")
    for (const tokens of [before, after]) delete tokens["--hm-space-8"]
  expect(after).toEqual(before)
}
const relativeUrl = (url: string): string => new URL(url).pathname + new URL(url).search
const compareAfter = async (
  baselineDirectory: string,
  name: string,
  receipt: CaptureReceipt,
): Promise<void> => {
  const receiptPath = resolve(baselineDirectory, `${name}.json`)
  if (!existsSync(receiptPath))
    throw new BaselineMismatchError("DS-01 baseline manifest missing or mismatched")
  const baseline = BaselineReceiptSchema.parse(JSON.parse(await readFile(receiptPath, "utf8")))
  if (baseline.state !== receipt.state)
    throw new BaselineMismatchError("DS-01 baseline manifest missing or mismatched")
  if (receipt.state === "status-error") {
    expect(baseline.statusError).toEqual({
      mapScopeSpace8: "",
      maxInlineSize: "none",
      referencesSpace8: true,
    })
    expect(receipt.statusError?.mapScopeSpace8).toBe("32px")
    expect(receipt.statusError?.maxInlineSize).not.toBe("none")
    assertComputedTokens(baseline.tokens, receipt.tokens)
    return
  }
  expect(receipt.screenshotSha256).toBe(baseline.screenshotSha256)
  expect(receipt.geometry).toEqual(baseline.geometry)
  expect(receipt.scroll).toEqual(baseline.scroll)
  expect(receipt.targetSizes).toEqual(baseline.targetSizes)
  assertComputedTokens(baseline.tokens, receipt.tokens)
  expect(receipt.image).toEqual(baseline.image)
  expect(receipt.viewport).toEqual(baseline.viewport)
  expect(relativeUrl(receipt.url)).toBe(relativeUrl(baseline.url))
}
export const captureEvidence = async (
  page: Page,
  session: EvidenceSession,
  state: CaptureState,
  viewport: Viewport,
  facts: CaptureFacts,
  sourceManifestSha256: string,
  errors: ErrorRecords,
): Promise<void> => {
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove())
  const screenshot = await page.screenshot({ fullPage: false })
  const observed = await observeMap(page, facts)
  const receipt: CaptureReceipt = {
    capturedAt: new Date().toISOString(),
    consoleErrors: errors.consoleErrors,
    deviceScaleFactor: await page.evaluate(() => window.devicePixelRatio),
    focus: observed.focus,
    geometry: observed.geometry,
    image: pngDimensions(screenshot),
    pageErrors: errors.pageErrors,
    phase: session.phase,
    reducedMotion: await page.evaluate(() =>
      matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "no-preference",
    ),
    screenshotSha256: digest(screenshot),
    scroll: observed.scroll,
    sourceManifestSha256,
    state,
    statusError: observed.statusError,
    targetSizes: observed.targetSizes,
    testId: TEST_ID,
    tokens: observed.tokens,
    url: page.url(),
    viewport: { height: viewport.height, width: viewport.width },
  }
  assertReceipt(receipt)
  const name = fileName(state, viewport)
  if (session.baselineDirectory !== null)
    await compareAfter(session.baselineDirectory, name, receipt)
  await Promise.all([
    writeFile(resolve(session.directory, `${name}.png`), screenshot),
    writeFile(resolve(session.directory, `${name}.json`), `${JSON.stringify(receipt, null, 2)}\n`),
  ])
}
