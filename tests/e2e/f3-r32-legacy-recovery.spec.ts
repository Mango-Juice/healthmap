import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { expect, test } from "./map-test"

const INVALID_LINK_NOTICE = "유효하지 않은 장소 링크를 기본 지도로 복구했습니다."
const VIEWPORT = { height: 812, width: 375 } as const

type R32RecoveryEvidence = {
  readonly buildId: string
  readonly detailCount: number
  readonly finalUrl: string
  readonly noticeLayout: NoticeLayout
  readonly noticeText: string
  readonly rowId: "R32"
  readonly screenshotSha256: string
  readonly sourceSha256: string
  readonly testId: string
  readonly unpublishedMarkerCount: number
  readonly unpublishedResultCount: number
  readonly viewport: typeof VIEWPORT
}

type Rectangle = {
  readonly bottom: number
  readonly left: number
  readonly right: number
  readonly top: number
}

type NoticeLayout = {
  readonly attention: Rectangle | null
  readonly hasPositiveArea: boolean
  readonly intersectsAttention: boolean
  readonly intersectsTray: boolean
  readonly isWithinViewport: boolean
  readonly notice: Rectangle
  readonly topmostSamples: readonly boolean[]
  readonly tray: Rectangle | null
}

const sha256File = async (path: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex")

const readNoticeLayout = (element: HTMLElement): NoticeLayout => {
  const toRectangle = (target: Element): Rectangle => {
    const rectangle = target.getBoundingClientRect()
    return {
      bottom: rectangle.bottom,
      left: rectangle.left,
      right: rectangle.right,
      top: rectangle.top,
    }
  }
  const intersects = (left: Rectangle, right: Rectangle | null): boolean =>
    right !== null &&
    left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top

  const notice = toRectangle(element)
  const tray = document.querySelector('[aria-label="검색 결과 패널"]')
  const attention = document.querySelector('[data-location-state="denied"]')
  const inset = 4
  const samples = [
    [notice.left + inset, notice.top + inset],
    [notice.right - inset, notice.top + inset],
    [(notice.left + notice.right) / 2, (notice.top + notice.bottom) / 2],
    [notice.left + inset, notice.bottom - inset],
    [notice.right - inset, notice.bottom - inset],
  ] as const

  return {
    attention: attention === null ? null : toRectangle(attention),
    hasPositiveArea: notice.right > notice.left && notice.bottom > notice.top,
    intersectsAttention: intersects(notice, attention === null ? null : toRectangle(attention)),
    intersectsTray: intersects(notice, tray === null ? null : toRectangle(tray)),
    isWithinViewport:
      notice.left >= 0 &&
      notice.top >= 0 &&
      notice.right <= window.innerWidth &&
      notice.bottom <= window.innerHeight,
    notice,
    topmostSamples: samples.map(([x, y]) => {
      const target = document.elementFromPoint(x, y)
      return target !== null && (target === element || element.contains(target))
    }),
    tray: tray === null ? null : toRectangle(tray),
  }
}

test.describe.configure({ retries: 0 })

test("Given a typed catalog and a stale legacy place slug, when it opens at 375x812, then it recovers safely with an invalid-link notice", async ({
  page,
}, testInfo) => {
  // Given
  await page.setViewportSize(VIEWPORT)

  // When
  await page.goto("/?place=not-published")

  // Then
  const notice = page.getByRole("status").filter({ hasText: INVALID_LINK_NOTICE })
  const unpublishedResult = page.locator('[data-place-slug="not-published"]')
  const unpublishedMarker = page
    .getByTestId("naver-map")
    .getByRole("button", { exact: true, name: "not-published" })
  await expect(page).toHaveURL("/")
  await expect(notice).toHaveText(INVALID_LINK_NOTICE)
  await expect(notice).toBeVisible()
  await expect(page.getByTestId("map-stage")).toBeVisible()
  await expect(page.getByRole("list", { name: "검색 결과" })).toBeVisible()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(unpublishedResult).toHaveCount(0)
  await expect(unpublishedMarker).toHaveCount(0)
  const finalUrl = page.url()
  const noticeText = await notice.innerText()
  const noticeLayout = await notice.evaluate(readNoticeLayout)
  const detailCount = await page.getByTestId("place-detail").count()
  const unpublishedResultCount = await unpublishedResult.count()
  const unpublishedMarkerCount = await unpublishedMarker.count()
  expect(new URL(finalUrl).search).toBe("")
  expect(noticeText).toBe(INVALID_LINK_NOTICE)
  expect(noticeLayout.hasPositiveArea).toBe(true)
  expect(noticeLayout.isWithinViewport).toBe(true)
  expect(noticeLayout.intersectsTray).toBe(false)
  expect(noticeLayout.intersectsAttention).toBe(false)
  expect(noticeLayout.topmostSamples.every(Boolean)).toBe(true)
  expect(detailCount).toBe(0)
  expect(unpublishedResultCount).toBe(0)
  expect(unpublishedMarkerCount).toBe(0)

  const screenshotPath = testInfo.outputPath("R32-invalid-legacy-share-recovery.png")
  await page.screenshot({ path: screenshotPath })
  const [screenshotSha256, sourceSha256] = await Promise.all([
    sha256File(screenshotPath),
    sha256File(fileURLToPath(import.meta.url)),
  ])
  const evidence = {
    buildId: process.env["F3_BUILD_ID"] ?? "local-build-id-unset",
    detailCount,
    finalUrl,
    noticeLayout,
    noticeText,
    rowId: "R32",
    screenshotSha256,
    sourceSha256,
    testId: testInfo.testId,
    unpublishedMarkerCount,
    unpublishedResultCount,
    viewport: VIEWPORT,
  } satisfies R32RecoveryEvidence
  const evidencePath = testInfo.outputPath("R32-invalid-legacy-share-recovery.json")
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2))
  await Promise.all([
    testInfo.attach("R32-invalid-legacy-share-recovery", {
      contentType: "image/png",
      path: screenshotPath,
    }),
    testInfo.attach("R32-invalid-legacy-share-recovery-state", {
      contentType: "application/json",
      path: evidencePath,
    }),
  ])
})
