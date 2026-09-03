import { expect, test } from "@playwright/test"

const viewports = [
  { height: 812, name: "mobile", width: 375 },
  { height: 1024, name: "tablet", width: 768 },
  { height: 800, name: "desktop", width: 1280 },
] as const

for (const viewport of viewports) {
  test(`Given the selection guide, When viewed at ${viewport.name}, Then its content fits without policy navigation`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto("/about")

    await expect(page.getByRole("heading", { level: 1, name: "건강식 선정 기준" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "무엇을 표시하나요" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "어떻게 확인하나요" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "어떻게 읽어야 하나요" })).toBeVisible()
    await expect(page.getByRole("link", { name: "지도로 돌아가기" })).toBeVisible()
    await expect(page.getByRole("link", { name: "개인정보 안내" })).toHaveCount(0)

    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(geometry.scrollWidth).toBe(geometry.clientWidth)
  })
}
