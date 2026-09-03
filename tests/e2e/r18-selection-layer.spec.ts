import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import type { BrowserContext, Page } from "@playwright/test"
import { expect, installMapTestRoutes, test } from "./map-test"

const viewport = { width: 188, height: 406 } as const

const sha256 = async (path: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex")

const createPage = async (context: BrowserContext, page: Page): Promise<void> => {
  await installMapTestRoutes(context)
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
  await page.goto("/")
  await page.getByRole("button", { name: "새싹 네모식당 상세 보기" }).click()
  await expect(page.locator("[aria-label='장소 상세'][data-detail-phase='open']")).toBeVisible()
}

test("R18 ordinary selection status stays announced below the settled detail title", async ({
  browser,
  baseURL,
}, testInfo) => {
  if (baseURL === undefined) throw new TypeError("R18 baseURL is required")
  const context = await browser.newContext({
    baseURL,
    deviceScaleFactor: 2,
    viewport,
  })
  const page = await context.newPage()
  await createPage(context, page)
  const notice = page.getByRole("status").filter({ hasText: "장소를 선택했습니다." })
  const title = page.getByRole("heading", { level: 2, name: "새싹 네모식당" })
  const actions = [
    page.getByRole("button", { name: "검색 결과로 돌아가기" }),
    page.getByRole("button", { name: "길찾기" }),
    page.getByRole("button", { name: "공유", exact: true }),
    page.getByRole("button", { name: "지도 공유" }),
  ]
  await expect(notice).toHaveText("장소를 선택했습니다.")
  await expect(title).toBeVisible()
  for (const action of actions) await expect(action).toBeVisible()
  const geometry = await page.evaluate(() => {
    const notice = Array.from(document.querySelectorAll<HTMLElement>("[role='status']")).find(
      (element) => element.textContent?.trim() === "장소를 선택했습니다.",
    )
    const title = document.querySelector<HTMLElement>("#place-detail-title")
    const detail = document.querySelector<HTMLElement>("[data-testid='place-detail']")
    if (notice === undefined || title === null || detail === null)
      throw new TypeError("R18 selection-layer targets missing")
    const noticeRect = notice.getBoundingClientRect()
    const titleRect = title.getBoundingClientRect()
    const intersectsTitle = !(
      noticeRect.right <= titleRect.left ||
      noticeRect.left >= titleRect.right ||
      noticeRect.bottom <= titleRect.top ||
      noticeRect.top >= titleRect.bottom
    )
    const noticeCenterHit = document.elementFromPoint(
      noticeRect.left + noticeRect.width / 2,
      noticeRect.top + noticeRect.height / 2,
    )
    const titleCenterHit = document.elementFromPoint(
      titleRect.left + titleRect.width / 2,
      titleRect.top + titleRect.height / 2,
    )
    const actionNames = ["검색 결과로 돌아가기", "길찾기", "공유", "지도 공유"]
    const actionGeometry = actionNames.map((name) => {
      const action = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) =>
          button.getAttribute("aria-label") === name || button.textContent?.trim() === name,
      )
      if (action === undefined) throw new TypeError(`R18 action missing: ${name}`)
      const rect = action.getBoundingClientRect()
      const centerHit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      )
      return {
        fullyInViewport:
          rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        height: rect.height,
        name,
        topmostAtCenter: centerHit !== null && action.contains(centerHit),
        width: rect.width,
      }
    })
    return {
      actionGeometry,
      detailContainsNoticeHit: noticeCenterHit !== null && detail.contains(noticeCenterHit),
      documentHorizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      intersectsTitle,
      noticeBelowTitle: noticeRect.top >= titleRect.bottom,
      noticeContainsCenterHit: noticeCenterHit !== null && notice.contains(noticeCenterHit),
      noticeKind: notice.dataset["selectionKind"] ?? "missing",
      noticeText: notice.textContent?.trim() ?? "",
      titleContainsCenterHit: titleCenterHit !== null && title.contains(titleCenterHit),
      titleInViewport: titleRect.top >= 0 && titleRect.bottom <= innerHeight,
    }
  })
  const screenshot = testInfo.outputPath("R18-selection-layer-376x812.png")
  const state = testInfo.outputPath("R18-selection-layer.json")
  await page.screenshot({ path: screenshot })
  await writeFile(
    state,
    `${JSON.stringify(
      {
        buildId: process.env["F3_BUILD_ID"] ?? "unbound",
        geometry,
        screenshotSha256: await sha256(screenshot),
        viewport,
      },
      null,
      2,
    )}\n`,
  )
  await testInfo.attach("R18-selection-layer.png", { contentType: "image/png", path: screenshot })
  await testInfo.attach("R18-selection-layer.json", {
    contentType: "application/json",
    path: state,
  })

  const { actionGeometry, ...surfaceGeometry } = geometry
  expect(surfaceGeometry).toEqual({
    detailContainsNoticeHit: true,
    documentHorizontalOverflow: false,
    intersectsTitle: false,
    noticeBelowTitle: true,
    noticeContainsCenterHit: false,
    noticeKind: "ordinary",
    noticeText: "장소를 선택했습니다.",
    titleContainsCenterHit: true,
    titleInViewport: true,
  })
  expect(actionGeometry.map(({ name }) => name)).toEqual([
    "검색 결과로 돌아가기",
    "길찾기",
    "공유",
    "지도 공유",
  ])
  for (const action of actionGeometry) {
    expect(action.fullyInViewport).toBe(true)
    expect(action.height).toBeGreaterThanOrEqual(44)
    expect(action.topmostAtCenter).toBe(true)
    expect(action.width).toBeGreaterThanOrEqual(44)
  }
  await context.close()
})
