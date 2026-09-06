import type { Page } from "@playwright/test"
import { expect, test } from "./map-test"
import { installDiscoveryStartGeolocation } from "./test-geolocation"

const openCurrentResults = async (page: Page): Promise<void> => {
  const outsideResults = page.getByRole("button", { name: "현재 지도 밖 5곳 보기" })
  if (!(await outsideResults.isVisible())) return
  await outsideResults.click()
  await expect(page.getByRole("button", { name: "새싹 네모식당 자세히 보기" })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await installDiscoveryStartGeolocation(page)
})

test("ordinary collected meals cannot bypass selection through search or detail", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await openCurrentResults(page)
  await expect(page.getByRole("checkbox", { name: "모든 메뉴 보기" })).toHaveCount(0)
  await page.getByRole("searchbox").fill("일반 확인 메뉴")
  await expect(page.getByText("이 조건에서 찾은 곳이 없어요.")).toBeVisible()
  await expect(page.getByRole("button", { name: "일반 확인 메뉴 자세히 보기" })).toHaveCount(0)
  await page.getByRole("searchbox").fill("새싹 네모식당")
  await page.getByRole("button", { name: "새싹 네모식당 자세히 보기" }).click()
  await expect(page.getByLabel("조건에 맞는 메뉴")).toContainText("초록 그릇")
  await expect(page.getByLabel("함께 살펴볼 메뉴")).toHaveCount(0)
})

test("current menu category conditions drive the card, detail, and explicit empty recovery", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await openCurrentResults(page)
  await page.getByRole("button", { name: "샐러드·포케 필터" }).click()
  await expect(page.getByLabel("검색 결과 수")).toHaveText(/[1-9]\d*곳 중 [1-9]\d*곳/)
  await page.getByRole("button", { name: "검색 결과 펼치기", exact: true }).click()
  const result = page.getByRole("button", { name: "새싹 네모식당 자세히 보기" })
  await expect(result).toContainText("초록 그릇")
  await result.click()
  await expect(page.getByLabel("조건에 맞는 메뉴")).toContainText("초록 그릇")
  await expect(page.getByRole("link", { name: "새싹 네모식당 길찾기" })).toHaveAttribute(
    "href",
    /map[.]naver[.]com/,
  )
  await page.keyboard.press("Escape")
  await expect(result).toBeFocused()
  await page.getByRole("searchbox").fill("없는메뉴검색")
  await page.getByRole("button", { name: "검색 결과 펼치기", exact: true }).click()
  await expect(page.getByText("이 조건에서 찾은 곳이 없어요.")).toBeVisible()
  await page.getByRole("button", { name: "검색어 지우기" }).click()
  await expect(page.getByRole("button", { name: "샐러드·포케 필터" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(result).toBeVisible()
})

test("rice ordering conditions remain visible and a matching place shows verified menu choices", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await openCurrentResults(page)
  await page.getByRole("button", { name: "잡곡·현미 필터" }).click()
  await expect(page.getByRole("button", { name: "새싹 네모식당 자세히 보기" })).toContainText(
    "초록 그릇",
  )
  await page.getByRole("button", { name: "전체 필터" }).click()
  await page.getByRole("searchbox").fill("구름 채소 도시락")
  await page.getByRole("button", { name: "구름 도시락 공방 자세히 보기" }).click()
  await expect(page.getByLabel("조건에 맞는 메뉴").getByRole("listitem").first()).toContainText(
    "구름 채소 도시락",
  )
  await expect(page.getByLabel("조건에 맞는 메뉴")).toContainText("단백 콩 도시락")
})
