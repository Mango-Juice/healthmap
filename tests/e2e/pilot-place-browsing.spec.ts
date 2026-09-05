import { expect, test } from "./map-test"

test("results restore their exact reading position and detail actions precede long menus", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 640 })
  await page.goto("/")
  await page.getByRole("button", { name: "검색 결과 펼치기", exact: true }).click()
  const scrollFixture = await page.addStyleTag({
    content:
      "aside[aria-label='건강식 검색 결과'] [class*='scrollBody'] { block-size: 120px !important; max-block-size: 120px !important; min-block-size: 0 !important; overflow-y: auto !important; }",
  })

  const listBody = page.locator("aside[aria-label='건강식 검색 결과'] [class*='scrollBody']")
  await listBody.evaluate((element) => {
    element.scrollTop = Math.min(40, element.scrollHeight - element.clientHeight)
  })
  const savedScroll = await listBody.evaluate((element) => element.scrollTop)
  expect(savedScroll).toBeGreaterThan(0)
  const result = page.locator("[data-pilot-place-id]").first()
  const placeId = await result.getAttribute("data-pilot-place-id")
  if (placeId === null) throw new Error("place ID missing")
  await result.click()
  await page.getByRole("button", { name: "메뉴 펼치기", exact: true }).click()

  const actions = page.locator("[class*='visitActions']")
  const menus = page.locator("[class*='menus'] h3").first()
  await expect(actions).toBeVisible()
  await expect(menus).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("detail-actions-375x640.png") })
  expect(
    await actions.evaluate((element) => {
      const menuSection = document.querySelector("[class*='menus']")
      if (menuSection === null) return 0
      return element.compareDocumentPosition(menuSection) & Node.DOCUMENT_POSITION_FOLLOWING
    }),
  ).toBeTruthy()

  await page.keyboard.press("Escape")
  const restored = page.locator(`[data-pilot-place-id="${placeId}"]`)
  await expect(restored).toBeVisible()
  await expect(restored).toBeFocused()
  await expect.poll(() => listBody.evaluate((element) => element.scrollTop)).toBe(savedScroll)
  await scrollFixture.evaluate((element) => element.remove())
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.screenshot({ path: testInfo.outputPath("results-768x1024.png") })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.screenshot({ path: testInfo.outputPath("results-1280x800.png") })
})
