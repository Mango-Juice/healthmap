import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { Page } from "@playwright/test"
import { e2eCatalog } from "../fixtures/e2e-catalog"
import { expect, test } from "./map-test"

const BUILD_ID = process.env["F3_BUILD_ID"] ?? "Y01PjmM02TzOG88X5Qcl_"
const TEST_ID = "F3-R30-marker-area-parity"
const VIEWPORT = { width: 1280, height: 800 } as const

type Bounds = {
  readonly northEast: { readonly latitude: number; readonly longitude: number }
  readonly southWest: { readonly latitude: number; readonly longitude: number }
}

type ParitySnapshot = {
  readonly listCount: number
  readonly listIds: readonly string[]
  readonly markerCount: number
  readonly markerIds: readonly string[]
}

const INITIAL_IDS = e2eCatalog.places.map(({ id }) => id)
const APPLIED_IDS = e2eCatalog.places
  .filter(({ slug }) => slug === "test-sprout-square")
  .map(({ id }) => id)
const idByMarkerName = new Map(e2eCatalog.places.map(({ id, name }) => [name, id]))
const idBySlug = new Map(e2eCatalog.places.map(({ id, slug }) => [slug, id]))

const sha256 = async (path: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex")

const knownId = (ids: ReadonlyMap<string, string>, key: string): string => {
  const id = ids.get(key)
  if (id === undefined) throw new Error(`Unrecognized typed catalog key: ${key}`)
  return id
}

const sorted = (ids: readonly string[]): string[] =>
  [...ids].sort((left, right) => left.localeCompare(right))

const captureParity = async (page: Page): Promise<ParitySnapshot> => {
  const surface = await page.evaluate(() => {
    const listSlugs = [...document.querySelectorAll<HTMLElement>("[data-place-slug]")]
      .map((element) => element.dataset["placeSlug"])
      .filter((slug): slug is string => slug !== undefined)
    const markerNames = [
      ...document.querySelectorAll<HTMLElement>("[data-test-naver-marker='true']"),
    ]
      .map((element) => element.getAttribute("aria-label"))
      .filter((name): name is string => name !== null)
    return { listSlugs, markerNames }
  })
  const listIds = surface.listSlugs.map((slug) => knownId(idBySlug, slug))
  const markerIds = surface.markerNames.map((name) => knownId(idByMarkerName, name))
  return {
    listCount: listIds.length,
    listIds,
    markerCount: markerIds.length,
    markerIds,
  }
}

const expectVisiblePlaces = (snapshot: ParitySnapshot, expectedIds: readonly string[]): void => {
  expect(snapshot.listCount).toBe(expectedIds.length)
  expect(snapshot.markerCount).toBe(expectedIds.length)
  expect(snapshot.listIds).toEqual(snapshot.markerIds)
  expect(sorted(snapshot.listIds)).toEqual(sorted(expectedIds))
}

const moveStubMap = async (page: Page, bounds: Bounds): Promise<string> =>
  page.evaluate((nextBounds) => {
    const maps: unknown = Reflect.get(window, "__healthMapTestMaps")
    if (!Array.isArray(maps)) return "missing-map"
    const candidates: readonly unknown[] = maps
    const testMap = candidates.find((candidate) => {
      if (typeof candidate !== "object" || candidate === null) return false
      const listeners: unknown = Reflect.get(candidate, "listeners")
      return typeof listeners === "object" && listeners !== null && "idle" in listeners
    })
    if (typeof testMap !== "object" || testMap === null) return "missing-map"
    const setTestBounds: unknown = Reflect.get(testMap, "setTestBounds")
    if (typeof setTestBounds !== "function") return "missing-bounds"
    Reflect.apply(setTestBounds, testMap, [nextBounds.southWest, nextBounds.northEast])
    return "moved"
  }, bounds)

test.describe.configure({ retries: 0 })
test.use({ viewport: VIEWPORT })

test("Given typed catalog and native SDK markers, when the pending area is applied, then list and marker IDs remain parity-bound", async ({
  page,
}, testInfo) => {
  // Given
  await page.goto("/")
  const markers = page.locator("[data-test-naver-marker='true']")
  const list = page.getByRole("list", { name: "검색 결과" })
  const pendingControl = page.getByRole("button", { name: "이 지역 검색" })
  await expect(list.getByRole("listitem")).toHaveCount(INITIAL_IDS.length)
  await expect(markers).toHaveCount(INITIAL_IDS.length)
  const before = await captureParity(page)
  expectVisiblePlaces(before, INITIAL_IDS)

  // When
  const narrowBounds: Bounds = {
    northEast: { latitude: 37.502, longitude: 127.034 },
    southWest: { latitude: 37.499, longitude: 127.031 },
  }
  expect(await moveStubMap(page, narrowBounds)).toBe("moved")
  expect(await moveStubMap(page, narrowBounds)).toBe("moved")

  // Then
  await expect(pendingControl).toBeVisible()
  const pending = await captureParity(page)
  expectVisiblePlaces(pending, INITIAL_IDS)
  expect(pending).toEqual(before)
  const screenshotPath = testInfo.outputPath("attach/R30-state-bound.png")
  await mkdir(dirname(screenshotPath), { recursive: true })
  await page.screenshot({ fullPage: false, path: screenshotPath })

  await pendingControl.click()
  await expect(pendingControl).toBeHidden()
  await expect(list.getByRole("listitem")).toHaveCount(APPLIED_IDS.length)
  await expect(markers).toHaveCount(APPLIED_IDS.length)
  const after = await captureParity(page)
  expectVisiblePlaces(after, APPLIED_IDS)

  const metadataPath = testInfo.outputPath("attach/R30-state-bound.json")
  const metadata = {
    after,
    before,
    buildId: BUILD_ID,
    pending,
    pendingControlVisible: true,
    rowId: "R30",
    screenshotSha256: await sha256(screenshotPath),
    sourceSha256: await sha256(testInfo.file),
    testId: TEST_ID,
    url: page.url(),
    viewport: VIEWPORT,
  }
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
  await testInfo.attach("R30-state-bound.png", { contentType: "image/png", path: screenshotPath })
  await testInfo.attach("R30-state-bound.json", {
    contentType: "application/json",
    path: metadataPath,
  })
})
