import { expect, test } from "@playwright/test"

const routes = [
  { heading: "건강식 지도", path: "/" },
  { heading: "건강식 지도", path: "/pilot" },
] as const

const viewports = [
  { height: 812, name: "mobile", width: 375 },
  { height: 1024, name: "tablet", width: 768 },
  { height: 800, name: "desktop", width: 1280 },
] as const

for (const route of routes) {
  for (const viewport of viewports) {
    test(`Given ${route.path} at ${viewport.name}, When the masthead renders, Then the compact identity fits without policy links`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.goto(route.path)

      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible()
      await expect(page.getByRole("link", { name: "선정 기준" })).toHaveCount(0)
      await expect(page.getByRole("link", { name: "개인정보" })).toHaveCount(0)

      const geometry = await page.evaluate(() => ({
        bodyScrollHeight: document.body.scrollHeight,
        clientWidth: document.documentElement.clientWidth,
        innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
      }))
      expect(geometry.scrollWidth).toBe(geometry.clientWidth)
      expect(geometry.bodyScrollHeight).toBe(geometry.innerHeight)
    })
  }
}
