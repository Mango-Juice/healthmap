import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"

export const TEST_ID = "DS-01-route-equivalence"
const SCHEMA_VERSION = 1
const SOURCE_PATHS = [
  "app/globals.css",
  "app/layout.tsx",
  "app/not-found.module.css",
  "app/not-found.tsx",
  "app/privacy/page.tsx",
  "app/privacy/privacy-preference.tsx",
  "app/privacy/privacy.css",
  "app/showcase/page.tsx",
  "app/showcase/showcase-client.tsx",
  "app/showcase/showcase-gallery.module.css",
  "app/showcase/showcase.module.css",
  "components/ui/health-map-feedback.module.css",
  "components/ui/health-map-icons.tsx",
  "components/ui/health-map-primitives.module.css",
  "components/ui/health-map-primitives.tsx",
  "tests/e2e/design-token-route-blocked-evidence.ts",
  "tests/e2e/design-token-route-equivalence.spec.ts",
  "tests/e2e/design-token-route-observations.ts",
  "tests/e2e/design-token-route-provenance.ts",
  "tests/e2e/design-token-route-states.ts",
] as const

export const MODES = [
  { deviceScaleFactor: 1, height: 812, name: "375x812", width: 375 },
  { deviceScaleFactor: 1, height: 1024, name: "768x1024", width: 768 },
  { deviceScaleFactor: 1, height: 800, name: "1280x800", width: 1280 },
  { deviceScaleFactor: 2, height: 406, name: "188x406-at-2x", width: 188 },
] as const

export type CapturePhase = "before" | "after"
export type Mode = (typeof MODES)[number]
export type RouteName = "not-found" | "privacy" | "showcase"

const RectSchema = z.object({
  bottom: z.number(),
  height: z.number(),
  left: z.number(),
  right: z.number(),
  top: z.number(),
  width: z.number(),
})
const SourceManifestSchema = z.object({
  files: z.array(z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })),
  schemaVersion: z.literal(SCHEMA_VERSION),
})
export const ReceiptSchema = z.object({
  cjkLineRects: z.record(z.string(), z.array(RectSchema)),
  consoleErrors: z.array(z.string()),
  deviceScaleFactor: z.number(),
  geometry: z.object({
    bodyScrollHeight: z.number(),
    clientHeight: z.number(),
    clientWidth: z.number(),
    documentScrollHeight: z.number(),
    horizontalOverflow: z.number(),
    scrollWidth: z.number(),
    verticalScroll: z.number(),
  }),
  id: z.string(),
  pageErrors: z.array(z.string()),
  phase: z.enum(["before", "after"]),
  physicalPixels: z.object({ height: z.number(), width: z.number() }),
  reducedMotion: z.literal("reduce"),
  route: z.enum(["not-found", "privacy", "showcase"]),
  schemaVersion: z.literal(SCHEMA_VERSION),
  screenshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceManifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.record(z.string(), z.unknown()),
  status: z.number(),
  targets: z.array(z.object({ name: z.string(), rect: RectSchema })),
  unexpectedConsoleErrors: z.array(z.string()),
  url: z.string(),
  viewport: z.object({ height: z.number(), width: z.number() }),
})
const ManifestSchema = z.object({
  captures: z.array(z.object({ id: z.string(), receipt: z.string(), screenshot: z.string() })),
  phase: z.literal("before"),
  schemaVersion: z.literal(SCHEMA_VERSION),
  sourceManifest: SourceManifestSchema,
  sourceManifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  testId: z.literal(TEST_ID),
})

export type Receipt = z.infer<typeof ReceiptSchema>
export type Capture = Readonly<{ id: string; receipt: string; screenshot: string }>

export class BaselineProvenanceError extends Error {
  constructor() {
    super("DS-01 baseline manifest missing or mismatched")
  }
}

export const digest = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex")

export const requirePhase = (): CapturePhase => {
  const phase = process.env["DS01_CAPTURE_PHASE"]?.trim()
  if (phase === "before" || phase === "after") return phase
  throw new Error("DS-01 requires DS01_CAPTURE_PHASE=before|after")
}

export const requireEvidenceDirectory = (): string => {
  const directory = process.env["DS01_EVIDENCE_DIR"]?.trim()
  if (directory) return directory
  throw new Error("DS-01 requires an explicit DS01_EVIDENCE_DIR")
}

export const requireBaselineDirectory = (): string => {
  const directory = process.env["DS01_BASELINE_DIR"]?.trim()
  if (directory) return directory
  throw new BaselineProvenanceError()
}

export const ensureFreshEvidenceDirectory = async (directory: string): Promise<void> => {
  if (existsSync(directory)) throw new Error("DS-01 baseline already exists; refusing overwrite")
  await mkdir(directory, { recursive: true })
}

export const sourceManifest = async (): Promise<
  Readonly<{ manifest: z.infer<typeof SourceManifestSchema>; sha256: string }>
> => {
  const files = await Promise.all(
    SOURCE_PATHS.map(async (path) => ({
      path,
      sha256: digest(await readFile(new URL(`../../${path}`, import.meta.url))),
    })),
  )
  files.sort((left, right) => left.path.localeCompare(right.path))
  const manifest = SourceManifestSchema.parse({ files, schemaVersion: SCHEMA_VERSION })
  return { manifest, sha256: digest(Buffer.from(JSON.stringify(manifest))) }
}

const parseJson = <Schema extends z.ZodType>(
  schema: Schema,
  text: string,
): z.infer<Schema> | null => {
  try {
    const parsed: unknown = JSON.parse(text)
    const result = schema.safeParse(parsed)
    return result.success ? result.data : null
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

export const readBaseline = async (
  directory: string,
  expectedIds: readonly string[],
): Promise<ReadonlyMap<string, Receipt>> => {
  let text: string
  try {
    text = await readFile(join(directory, "manifest.json"), "utf8")
  } catch (error) {
    if (error instanceof Error) throw new BaselineProvenanceError()
    throw error
  }
  const manifest = parseJson(ManifestSchema, text)
  if (
    manifest === null ||
    digest(Buffer.from(JSON.stringify(manifest.sourceManifest))) !==
      manifest.sourceManifestSha256 ||
    manifest.captures.length !== expectedIds.length ||
    manifest.captures.some((capture, index) => capture.id !== expectedIds[index])
  )
    throw new BaselineProvenanceError()
  const records = new Map<string, Receipt>()
  for (const capture of manifest.captures) {
    let receiptText: string
    let screenshot: Buffer
    try {
      ;[receiptText, screenshot] = await Promise.all([
        readFile(join(directory, capture.receipt), "utf8"),
        readFile(join(directory, capture.screenshot)),
      ])
    } catch (error) {
      if (error instanceof Error) throw new BaselineProvenanceError()
      throw error
    }
    const receipt = parseJson(ReceiptSchema, receiptText)
    if (
      receipt === null ||
      receipt.phase !== "before" ||
      receipt.id !== capture.id ||
      receipt.sourceManifestSha256 !== manifest.sourceManifestSha256 ||
      digest(screenshot) !== receipt.screenshotSha256 ||
      records.has(capture.id)
    )
      throw new BaselineProvenanceError()
    records.set(capture.id, receipt)
  }
  return records
}

export const writeManifest = async (
  directory: string,
  phase: CapturePhase,
  captures: readonly Capture[],
  source: Awaited<ReturnType<typeof sourceManifest>>,
): Promise<void> => {
  await writeFile(
    join(directory, "manifest.json"),
    `${JSON.stringify(
      {
        captures,
        phase,
        schemaVersion: SCHEMA_VERSION,
        sourceManifest: source.manifest,
        sourceManifestSha256: source.sha256,
        testId: TEST_ID,
      },
      null,
      2,
    )}\n`,
  )
}

export const writeSourceManifest = async (
  directory: string,
  source: Awaited<ReturnType<typeof sourceManifest>>,
): Promise<void> =>
  writeFile(
    join(directory, "source-manifest.json"),
    `${JSON.stringify({ ...source.manifest, sha256: source.sha256 }, null, 2)}\n`,
  )
