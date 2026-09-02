import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { captureRoute } from "./design-token-route-observations"
import {
  BaselineProvenanceError,
  ensureFreshEvidenceDirectory,
  MODES,
  readBaseline,
  requireBaselineDirectory,
  requireEvidenceDirectory,
  requirePhase,
  sourceManifest,
  writeManifest,
  writeSourceManifest,
} from "./design-token-route-provenance"

const ROUTES = ["privacy", "not-found", "showcase"] as const

test.describe.configure({ retries: 0 })

test("Given DS-01 route baselines, when the configured phase runs, then every capture is provenance-bound", async ({
  baseURL,
  browser,
}) => {
  const phase = requirePhase()
  const evidenceDirectory = requireEvidenceDirectory()
  const expectedIds = MODES.flatMap((mode) => ROUTES.map((route) => `${route}-${mode.name}`))
  const baseline =
    phase === "after" ? await readBaseline(requireBaselineDirectory(), expectedIds) : null
  await ensureFreshEvidenceDirectory(evidenceDirectory)
  const source = await sourceManifest()
  await writeSourceManifest(evidenceDirectory, source)

  const captures: Array<Readonly<{ id: string; receipt: string; screenshot: string }>> = []
  for (const mode of MODES) {
    for (const route of ROUTES) {
      const { receipt, screenshot } = await captureRoute({
        baseURL,
        browser,
        mode,
        phase,
        route,
        sourceManifestSha256: source.sha256,
      })
      const screenshotName = `${receipt.id}.png`
      const receiptName = `${receipt.id}.json`
      await Promise.all([
        writeFile(join(evidenceDirectory, screenshotName), screenshot),
        writeFile(join(evidenceDirectory, receiptName), `${JSON.stringify(receipt, null, 2)}\n`),
      ])
      if (baseline !== null) {
        const baselineReceipt = baseline.get(receipt.id)
        if (baselineReceipt === undefined) throw new BaselineProvenanceError()
        expect(receipt.screenshotSha256).toBe(baselineReceipt.screenshotSha256)
        expect({
          ...receipt,
          phase: "before",
          sourceManifestSha256: baselineReceipt.sourceManifestSha256,
        }).toStrictEqual(baselineReceipt)
      }
      captures.push({ id: receipt.id, receipt: receiptName, screenshot: screenshotName })
    }
  }
  await writeManifest(evidenceDirectory, phase, captures, source)
})
