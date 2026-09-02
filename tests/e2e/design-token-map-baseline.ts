import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { z } from "zod"
import {
  BaselineMismatchError,
  type CaptureReceipt,
  type SourceManifest,
  TEST_ID,
} from "./design-token-map-types"

export const SOURCE_FILES = [
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

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const BoxSchema = z
  .object({
    bottom: z.number(),
    height: z.number(),
    left: z.number(),
    right: z.number(),
    top: z.number(),
    width: z.number(),
  })
  .strict()
const ScrollMeasurementSchema = z
  .object({ clientHeight: z.number(), overflowY: z.string(), scrollHeight: z.number() })
  .strict()
const CaptureReceiptSchema = z
  .object({
    capturedAt: z.string(),
    consoleErrors: z.array(z.string()),
    deviceScaleFactor: z.number(),
    focus: z.object({ accessibleName: z.string(), tagName: z.string() }).strict(),
    geometry: z.record(z.string(), BoxSchema.nullable()),
    image: z.object({ height: z.number(), width: z.number() }).strict(),
    pageErrors: z.array(z.string()),
    phase: z.enum(["before", "after"]),
    reducedMotion: z.enum(["no-preference", "reduce"]),
    screenshotSha256: HashSchema,
    scroll: z
      .object({
        documentOverflow: z.boolean(),
        overflowingOwners: z.array(z.string()),
        owners: z.array(z.string()),
        regions: z.record(z.string(), ScrollMeasurementSchema),
      })
      .strict(),
    sourceManifestSha256: HashSchema,
    state: z.enum(["discovery", "detail", "detail-reduced-motion", "status-error"]),
    statusError: z
      .object({
        mapScopeSpace8: z.string(),
        maxInlineSize: z.string(),
        referencesSpace8: z.boolean(),
      })
      .strict()
      .nullable(),
    targetSizes: z.array(
      z
        .object({
          accessibleName: z.string(),
          height: z.number(),
          tagName: z.string(),
          width: z.number(),
        })
        .strict(),
    ),
    testId: z.literal(TEST_ID),
    tokens: z.record(z.string(), z.string()),
    url: z.string().url(),
    viewport: z.object({ height: z.number(), width: z.number() }).strict(),
  })
  .strict()
const SourceManifestSchema = z
  .object({
    files: z.array(z.object({ path: z.string(), sha256: HashSchema }).strict()),
    sha256: HashSchema,
    testId: z.literal(TEST_ID),
  })
  .strict()

const parseJson = <Schema extends z.ZodType>(schema: Schema, text: string): z.infer<Schema> => {
  try {
    return schema.parse(JSON.parse(text))
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError)
      throw new BaselineMismatchError("DS-01 baseline manifest missing or mismatched")
    throw error
  }
}
const readJson = async <Schema extends z.ZodType>(
  schema: Schema,
  path: string,
): Promise<z.infer<Schema>> => {
  try {
    return parseJson(schema, await readFile(path, "utf8"))
  } catch (error) {
    if (error instanceof Error && !(error instanceof BaselineMismatchError))
      throw new BaselineMismatchError("DS-01 baseline manifest missing or mismatched")
    throw error
  }
}
export const digest = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex")
const sha256 = async (path: string): Promise<string> => digest(await readFile(path))
export const writeSourceManifest = async (directory: string): Promise<SourceManifest> => {
  const files = await Promise.all(
    SOURCE_FILES.map(async (path) => ({
      path,
      sha256: await sha256(resolve(process.cwd(), path)),
    })),
  )
  const sorted = files.sort((left, right) => left.path.localeCompare(right.path))
  const sha = digest(Buffer.from(JSON.stringify({ files: sorted, testId: TEST_ID })))
  const manifest: SourceManifest = { files: sorted, sha256: sha, testId: TEST_ID }
  await writeFile(
    resolve(directory, "source-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  return manifest
}
const validateManifest = (manifest: z.infer<typeof SourceManifestSchema>): void => {
  const expected = [...SOURCE_FILES].sort()
  const paths = manifest.files.map(({ path }) => path)
  if (
    manifest.sha256 !==
      digest(Buffer.from(JSON.stringify({ files: manifest.files, testId: TEST_ID }))) ||
    paths.length !== expected.length ||
    paths.some((path, index) => path !== expected[index])
  )
    throw new BaselineMismatchError("DS-01 baseline manifest missing or mismatched")
}
export const readBaselineCapture = async (
  baselineDirectory: string,
  name: string,
): Promise<Readonly<{ readonly manifest: SourceManifest; readonly receipt: CaptureReceipt }>> => {
  const manifest = await readJson(
    SourceManifestSchema,
    resolve(baselineDirectory, "source-manifest.json"),
  )
  validateManifest(manifest)
  const receipt = await readJson(CaptureReceiptSchema, resolve(baselineDirectory, `${name}.json`))
  if (receipt.phase !== "before" || receipt.sourceManifestSha256 !== manifest.sha256)
    throw new BaselineMismatchError("DS-01 baseline manifest missing or mismatched")
  const screenshot = await readFile(resolve(baselineDirectory, `${name}.png`)).catch(
    (error: unknown) => {
      if (error instanceof Error)
        throw new BaselineMismatchError("DS-01 baseline manifest missing or mismatched")
      throw error
    },
  )
  if (digest(screenshot) !== receipt.screenshotSha256)
    throw new BaselineMismatchError("DS-01 baseline manifest missing or mismatched")
  return { manifest, receipt }
}
