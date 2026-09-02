import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  captureEvidence,
  createEvidenceSession,
  readCaptureFacts,
  writeSourceManifest,
} from "./design-token-map-evidence"
import {
  attachErrorRecorders,
  installAuthorizationFailure,
  installNoGeolocation,
  probeLongCjkUrl,
  verifyInterruptions,
  waitForDetail,
} from "./design-token-map-observe"
import { TRIGGER_NAME, VIEWPORTS, ZOOM_VIEWPORT } from "./design-token-map-types"
import { expect, installMapTestRoutes, test } from "./map-test"

test.describe.configure({ mode: "serial", retries: 0 })
test("DS-01 captures deterministic map token equivalence evidence", async ({
  browser,
  context,
  page,
}) => {
  const session = await createEvidenceSession()
  const [facts, manifest] = await Promise.all([
    readCaptureFacts(),
    writeSourceManifest(session.directory),
  ])
  await installNoGeolocation(context)
  const errors = attachErrorRecorders(page)

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: "no-preference" })
    await page.goto("/")
    await expect(page.getByText("NAVER 지도 연결됨")).toBeVisible()
    await captureEvidence(page, session, "discovery", viewport, facts, manifest.sha256, errors)
    const trigger = page.getByRole("button", { name: TRIGGER_NAME })
    await trigger.focus()
    await trigger.click()
    await waitForDetail(page)
    await captureEvidence(page, session, "detail", viewport, facts, manifest.sha256, errors)
    if (viewport.name === "375x812") {
      const stress = await probeLongCjkUrl(page)
      await writeFile(
        resolve(session.directory, "long-cjk-url-375x812.json"),
        `${JSON.stringify(stress, null, 2)}\n`,
      )
      await verifyInterruptions(page)
    }
  }

  const zoomContext = await browser.newContext({ deviceScaleFactor: 2, viewport: ZOOM_VIEWPORT })
  try {
    await installMapTestRoutes(zoomContext)
    await installNoGeolocation(zoomContext)
    const zoomPage = await zoomContext.newPage()
    const zoomErrors = attachErrorRecorders(zoomPage)
    await zoomPage.goto("/")
    await expect(zoomPage.getByText("NAVER 지도 연결됨")).toBeVisible()
    await captureEvidence(
      zoomPage,
      session,
      "discovery",
      ZOOM_VIEWPORT,
      facts,
      manifest.sha256,
      zoomErrors,
    )
    await zoomPage.getByRole("button", { name: TRIGGER_NAME }).click()
    await waitForDetail(zoomPage)
    await captureEvidence(
      zoomPage,
      session,
      "detail",
      ZOOM_VIEWPORT,
      facts,
      manifest.sha256,
      zoomErrors,
    )
  } finally {
    await zoomContext.close()
  }

  await page.setViewportSize(VIEWPORTS[0])
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await page.getByRole("button", { name: TRIGGER_NAME }).click()
  await waitForDetail(page)
  await captureEvidence(
    page,
    session,
    "detail-reduced-motion",
    VIEWPORTS[0],
    facts,
    manifest.sha256,
    errors,
  )

  await installAuthorizationFailure(page)
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto("/")
  await expect(page.locator("[data-tone='error'][role='alert']")).toBeVisible()
  await captureEvidence(page, session, "status-error", VIEWPORTS[0], facts, manifest.sha256, errors)
})
