import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { PublicCatalogQueryResponseSchema } from "../../lib/catalog/query-contract"
import { longKoreanTypedStress, typedLongKoreanStressCatalog } from "../fixtures/e2e-catalog"
import { installCatalogQueryRoutes } from "./catalog-query-fixture"
import { expect, test } from "./map-test"

const ROW_ID = "R29"
const TEST_ID = "f3-r29-manual-share-scroll"
const VIEWPORT = { height: 812, width: 375 } as const

type DetailCoordinates = {
  readonly documentScrollTop: number
  readonly surfaceTop: number
  readonly titleTop: number
}

type R29Evidence = {
  readonly bodyScrollTop: number
  readonly buildId: string
  readonly documentOverflow: boolean
  readonly documentScrollTop: number
  readonly manualUrlVisible: boolean
  readonly rowId: typeof ROW_ID
  readonly screenshotSha256: string
  readonly scrollOwners: readonly string[]
  readonly sourceSha256: string
  readonly surfaceTopAfter: number
  readonly surfaceTopBefore: number
  readonly testId: typeof TEST_ID
  readonly titleTopAfter: number
  readonly titleTopBefore: number
  readonly url: string
  readonly viewport: typeof VIEWPORT
}

const hashFile = async (path: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex")

test.describe.configure({ retries: 0 })

test("Given unavailable Web Share and working Clipboard, when a normal detail is shared, then clipboard fallback stays pinned", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    })
  })
  await page.goto("/")
  await page
    .getByRole("combobox", { name: "지역 선택" })
    .selectOption({ label: "서울 강남구 · 5곳" })
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  await page.getByRole("button", { exact: true, name: "공유" }).click()

  await expect(page.getByText("공유 URL을 클립보드에 복사했습니다.")).toBeVisible()
  await expect(page.getByLabel("공유 URL")).toHaveCount(0)
})

test("Given rejected browser sharing and long typed detail content, when manual sharing scrolls the sheet body, then R29 captures one scroll owner", async ({
  context,
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException("blocked")) },
    })
  })
  await page.setViewportSize(VIEWPORT)
  await page.goto("/")
  await page
    .getByRole("combobox", { name: "지역 선택" })
    .selectOption({ label: "서울 강남구 · 5곳" })
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)

  await expect(page.getByRole("button", { name: "새싹 네모식당 상세 보기" })).toBeVisible()
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
  await expect(page.getByRole("button", { name: "장소 새로고침" })).toBeEnabled()
  await installCatalogQueryRoutes(context, typedLongKoreanStressCatalog)
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/map-catalog/query" &&
      response.request().method() === "GET",
  )
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  const responseCatalog = PublicCatalogQueryResponseSchema.parse(
    await (await responsePromise).json(),
  )
  expect(responseCatalog.catalogVersion).toBe(typedLongKoreanStressCatalog.catalogVersion)

  const detailButton = page.getByRole("button", {
    name: `${longKoreanTypedStress.placeName} 상세 보기`,
  })
  await expect(detailButton).toBeVisible()
  await expect(detailButton).toContainText(longKoreanTypedStress.menuName)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await detailButton.click()
    await expect(page.getByTestId("place-detail")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("place-detail")).toHaveCount(0)
  }

  await detailButton.click()
  await expect(page.getByTestId("place-detail")).toBeVisible()
  await expect(
    page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
  ).toBeVisible()
  await page.getByRole("button", { exact: true, name: "공유" }).click()
  const manualUrl = page.getByLabel("공유 URL")
  await expect(manualUrl).toBeVisible()

  const body = page.getByTestId("place-detail-body")
  const before = await body.evaluate((element): DetailCoordinates => {
    if (!(element instanceof HTMLElement)) throw new Error("R29 body is not an HTML element")
    const surface = element.closest<HTMLElement>("[data-detail-phase]")
    const title = document.querySelector<HTMLElement>("#place-detail-title")
    if (surface === null || title === null)
      throw new Error("R29 detail coordinates are unavailable")
    return {
      documentScrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
      surfaceTop: surface.getBoundingClientRect().top,
      titleTop: title.getBoundingClientRect().top,
    }
  })
  expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  await body.hover()
  await page.mouse.wheel(0, 600)
  const after = await body.evaluate(
    (element) =>
      new Promise<DetailCoordinates & { readonly scrollTop: number }>((resolve) => {
        requestAnimationFrame(() => {
          if (!(element instanceof HTMLElement)) throw new Error("R29 body is not an HTML element")
          const surface = element.closest<HTMLElement>("[data-detail-phase]")
          const title = document.querySelector<HTMLElement>("#place-detail-title")
          if (surface === null || title === null)
            throw new Error("R29 detail coordinates are unavailable")
          resolve({
            documentScrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
            scrollTop: element.scrollTop,
            surfaceTop: surface.getBoundingClientRect().top,
            titleTop: title.getBoundingClientRect().top,
          })
        })
      }),
  )
  const scrollOwnership = await page.evaluate(() => ({
    documentOverflow: document.documentElement.scrollHeight > window.innerHeight,
    owners: Array.from(document.querySelectorAll<HTMLElement>("*")).flatMap((element) => {
      const overflowY = getComputedStyle(element).overflowY
      if (overflowY !== "auto" && overflowY !== "scroll") return []
      return [
        element.dataset["testid"] ?? element.getAttribute("role") ?? element.tagName.toLowerCase(),
      ]
    }),
  }))
  const sharedUrl = await manualUrl.inputValue()

  expect(before.documentScrollTop).toBe(0)
  expect(after.scrollTop).toBeGreaterThan(0)
  expect(after.documentScrollTop).toBe(0)
  expect(after.surfaceTop).toBe(before.surfaceTop)
  expect(after.titleTop).toBe(before.titleTop)
  expect(scrollOwnership.documentOverflow).toBe(false)
  expect(scrollOwnership.owners).toEqual(["place-detail-body"])
  expect(new URL(sharedUrl).pathname).toBe("/places/test-sprout-square")
  await expect(manualUrl).toBeVisible()

  const screenshotPath = testInfo.outputPath("R29-manual-share-scroll-375x812.png")
  const metadataPath = testInfo.outputPath("R29-manual-share-scroll-state.json")
  await page.screenshot({ path: screenshotPath })
  const evidence: R29Evidence = {
    bodyScrollTop: after.scrollTop,
    buildId: process.env["F3_BUILD_ID"] ?? "unbound",
    documentOverflow: scrollOwnership.documentOverflow,
    documentScrollTop: after.documentScrollTop,
    manualUrlVisible: await manualUrl.isVisible(),
    rowId: ROW_ID,
    screenshotSha256: await hashFile(screenshotPath),
    scrollOwners: scrollOwnership.owners,
    sourceSha256: await hashFile(testInfo.file),
    surfaceTopAfter: after.surfaceTop,
    surfaceTopBefore: before.surfaceTop,
    testId: TEST_ID,
    titleTopAfter: after.titleTop,
    titleTopBefore: before.titleTop,
    url: sharedUrl,
    viewport: VIEWPORT,
  }
  await writeFile(metadataPath, JSON.stringify(evidence, null, 2))
  await testInfo.attach("R29-manual-share-scroll", {
    path: screenshotPath,
    contentType: "image/png",
  })
  await testInfo.attach("R29-manual-share-scroll-state", {
    contentType: "application/json",
    path: metadataPath,
  })
})
