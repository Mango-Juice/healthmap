import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { Page } from "@playwright/test"
import { PublicCatalogQueryResponseSchema } from "../../lib/catalog/query-contract"
import { PublicCatalogSnapshotSchema } from "../../lib/domain/catalog"
import { e2eCatalog } from "../fixtures/e2e-catalog"
import { installCatalogQueryRoutes } from "./catalog-query-fixture"
import { expect, test } from "./map-test"

const TEST_ID = "F3-R23-direct-confirmation-detail"
const VIEWPORT = { width: 375, height: 812 } as const
const NORMAL_RESULT_NAME = "새싹 네모식당"
const DIRECT_RESULT_NAME = "R23 직접 확인 식당"
const DIRECT_CONFIRMATION_MENU = {
  dataMode: "production",
  displayOrder: 99,
  evidenceUrl: null,
  healthTags: ["vegetables", "balanced"],
  id: "10000000-0000-4000-8000-000000000023",
  name: "R23 직접 확인 채소 접시",
  placeId: "6dd657be-fc3b-4bb8-8e67-fabbee0f2ea0",
  published: true,
  validUntil: "2026-11-19",
  verificationMethod: "direct_confirmation",
  verifiedAt: "2026-08-21",
} as const

const normalCatalog = PublicCatalogSnapshotSchema.parse(e2eCatalog)
const directConfirmationCatalog = PublicCatalogSnapshotSchema.parse({
  ...normalCatalog,
  catalogVersion: "f3-r23-direct-confirmation",
  menus: [DIRECT_CONFIRMATION_MENU],
  places: normalCatalog.places.map((place) =>
    place.id === DIRECT_CONFIRMATION_MENU.placeId ? { ...place, name: DIRECT_RESULT_NAME } : place,
  ),
})

const sha256 = async (path: string | URL): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex")

type ElementGeometry = {
  readonly hitTarget: string | null
  readonly inViewport: boolean
  readonly rectangle: {
    readonly bottom: number
    readonly height: number
    readonly left: number
    readonly right: number
    readonly top: number
    readonly width: number
  }
  readonly topmost: boolean
}

type DetailGeometry = {
  readonly detail: ElementGeometry
  readonly method: ElementGeometry
  readonly title: ElementGeometry
  readonly viewport: { readonly height: number; readonly width: number }
}

const readDetailGeometry = async (page: Page): Promise<DetailGeometry> =>
  page.evaluate((menuName) => {
    const detail = document.querySelector<HTMLElement>("[data-testid='place-detail']")
    const title = document.querySelector<HTMLElement>("#place-detail-title")
    const menu = [
      ...document.querySelectorAll<HTMLElement>("[data-testid='place-detail'] li"),
    ].find((element) => element.textContent?.includes(menuName) ?? false)
    const method = menu?.querySelector<HTMLElement>("span")
    if (detail === null || title === null || method === undefined || method === null)
      throw new TypeError("Direct-confirmation detail geometry is unavailable")

    const snapshot = (element: HTMLElement): ElementGeometry => {
      const rectangle = element.getBoundingClientRect()
      const centerX = rectangle.left + rectangle.width / 2
      const centerY = rectangle.top + rectangle.height / 2
      const target = document.elementFromPoint(centerX, centerY)
      return {
        hitTarget: target?.tagName ?? null,
        inViewport:
          rectangle.width > 0 &&
          rectangle.height > 0 &&
          rectangle.left >= 0 &&
          rectangle.top >= 0 &&
          rectangle.right <= window.innerWidth &&
          rectangle.bottom <= window.innerHeight,
        rectangle: {
          bottom: rectangle.bottom,
          height: rectangle.height,
          left: rectangle.left,
          right: rectangle.right,
          top: rectangle.top,
          width: rectangle.width,
        },
        topmost:
          target !== null &&
          (target === element || element.contains(target) || target.contains(element)),
      }
    }

    return {
      detail: snapshot(detail),
      method: snapshot(method),
      title: snapshot(title),
      viewport: { height: window.innerHeight, width: window.innerWidth },
    }
  }, DIRECT_CONFIRMATION_MENU.name)

test.describe.configure({ retries: 0 })
test.use({ viewport: VIEWPORT })

test("Given a typed direct-confirmation catalog, when its place detail opens, then it shows its menu and visit action without internal records", async ({
  context,
  page,
}, testInfo) => {
  // Given

  // Given
  await page.goto("/")
  await page
    .getByRole("combobox", { name: "지역 선택" })
    .selectOption({ label: "서울 강남구 · 5곳" })
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
  await expect(page.getByRole("button", { name: `${NORMAL_RESULT_NAME} 상세 보기` })).toBeVisible()

  // When
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
  await expect(page.getByRole("button", { name: "장소 새로고침" })).toBeEnabled()
  await installCatalogQueryRoutes(context, directConfirmationCatalog)
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/map-catalog/query" &&
      response.request().method() === "GET",
  )
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  const responseCatalog = PublicCatalogQueryResponseSchema.parse(
    await (await responsePromise).json(),
  )

  // Then
  expect(responseCatalog.catalogVersion).toBe(directConfirmationCatalog.catalogVersion)
  const directResult = page.getByRole("button", { name: `${DIRECT_RESULT_NAME} 상세 보기` })
  await expect(directResult).toContainText(DIRECT_CONFIRMATION_MENU.name)
  await expect(page.getByRole("button", { name: `${NORMAL_RESULT_NAME} 상세 보기` })).toHaveCount(0)

  // When
  await directResult.click()

  // Then
  const detail = page.getByTestId("place-detail")
  const directMenu = detail.getByRole("listitem").filter({ hasText: DIRECT_CONFIRMATION_MENU.name })
  await expect(detail).toBeVisible()
  await expect(
    page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
  ).toBeVisible()
  await expect(detail.getByRole("heading", { name: DIRECT_RESULT_NAME })).toBeVisible()
  await expect(directMenu).toContainText(DIRECT_CONFIRMATION_MENU.name)
  await expect(directMenu).toContainText("선택한 조건에 맞는 메뉴")
  await expect(detail).not.toContainText(/직접 확인 기록|2026-08-21|2026-11-19/)
  await expect(detail.getByRole("link", { name: "검증 근거 보기" })).toHaveCount(0)
  await expect(detail.getByRole("link", { name: "네이버에서 보기" })).toHaveAttribute(
    "href",
    "https://map.naver.com/p/entry/place/1",
  )
  await directMenu.scrollIntoViewIfNeeded()

  const geometryBeforeScreenshot = await readDetailGeometry(page)
  expect(geometryBeforeScreenshot.detail.inViewport).toBe(true)
  expect(geometryBeforeScreenshot.detail.topmost).toBe(true)
  expect(geometryBeforeScreenshot.title.inViewport).toBe(true)
  expect(geometryBeforeScreenshot.title.topmost).toBe(true)
  expect(geometryBeforeScreenshot.method).toMatchObject({ inViewport: true, topmost: true })

  const screenshotPath = testInfo.outputPath("attach/R23.png")
  const metadataPath = testInfo.outputPath("attach/R23.json")
  await mkdir(dirname(screenshotPath), { recursive: true })
  await page.screenshot({ path: screenshotPath, fullPage: false })
  const geometryAfterScreenshot = await readDetailGeometry(page)
  expect(geometryAfterScreenshot.detail.inViewport).toBe(true)
  expect(geometryAfterScreenshot.detail.topmost).toBe(true)
  expect(geometryAfterScreenshot.title.inViewport).toBe(true)
  expect(geometryAfterScreenshot.title.topmost).toBe(true)
  expect(geometryAfterScreenshot.method).toMatchObject({ inViewport: true, topmost: true })

  const metadata = {
    buildId: process.env["F3_BUILD_ID"] ?? "local-dev",
    catalogVersion: responseCatalog.catalogVersion,
    evidenceLinkCount: await detail.getByRole("link", { name: "검증 근거 보기" }).count(),
    geometryAfterScreenshot,
    geometryBeforeScreenshot,
    observedDetailTitle: await detail
      .getByRole("heading", { name: DIRECT_RESULT_NAME })
      .innerText(),
    refreshResultName: DIRECT_RESULT_NAME,
    rowId: "R23",
    screenshotSha256: await sha256(screenshotPath),
    sourceSha256: await sha256(new URL("./f3-r23-direct-confirmation.spec.ts", import.meta.url)),
    testId: TEST_ID,
    url: page.url(),
    viewport: VIEWPORT,
    visibleMethodText: await directMenu.locator("span").first().innerText(),
  }
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
  await testInfo.attach("R23.png", { contentType: "image/png", path: screenshotPath })
  await testInfo.attach("R23.json", { contentType: "application/json", path: metadataPath })
})
