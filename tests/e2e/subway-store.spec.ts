import { expect, test } from "@playwright/test"

const evidenceDirectory =
  ".omo/evidence/regional-readiness/20260905T172102Z-subway-release/S2/browser"

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
] as const) {
  test(`opens an honest Subway store detail on ${viewport.name}`, async ({ page, request }) => {
    // Given the real store-only snapshot rendered in the root FoodMap.
    expect((await request.get("/")).ok()).toBe(true)
    await page.setViewportSize(viewport)
    await page.goto("/")
    const search = page.getByRole("searchbox", { name: "가게나 메뉴 검색" })

    // When a visitor searches Subway and opens the first bounded result.
    await search.fill("서브웨이")
    const result = page.getByRole("button", { name: /서브웨이 .+ 자세히 보기/u }).first()
    await expect(result).toBeVisible()
    await result.click()

    // Then the detail exposes store facts and navigation without a menu or health claim.
    const storeSummary = page.locator("p").filter({ hasText: "서브웨이 · 샌드위치 매장" })
    await expect(storeSummary).toContainText("메뉴 정보는 아직 확인되지 않았어요.")
    await expect(page.getByRole("link", { name: "장소 정보 보기" })).toHaveAttribute(
      "href",
      /^https:\/\/(?:www\.)?subway\.co\.kr\/storeDetail\?franchiseNo=\d+$/u,
    )
    await expect(page.getByRole("link", { name: /길찾기/u })).toHaveAttribute(
      "href",
      /^https:\/\/map\.naver\.com\/index\.nhn\?/u,
    )
    await expect(page.getByText("태그는 음식과 메뉴에서 확인된 특징이며")).toHaveCount(0)
    await page.screenshot({
      path: `${evidenceDirectory}/subway-detail-${viewport.width}x${viewport.height}.png`,
    })

    // When the visitor returns and applies a health-category filter.
    await page
      .getByRole("button", {
        name: viewport.name === "mobile" ? "장소 닫기" : "장소에서 돌아가기",
      })
      .click()
    await page.getByRole("button", { name: "샐러드·포케 필터" }).click()

    // Then store-only Subway results are excluded from that evidence-backed category.
    await expect(page.getByRole("button", { name: /서브웨이 .+ 자세히 보기/u })).toHaveCount(0)
  })
}
