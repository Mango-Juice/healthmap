import { expect, test } from "./map-test"

test("shows an error instead of a synthetic map when NAVER authorization fails", async ({
  page,
}) => {
  await page.route("https://oapi.map.naver.com/**", async (route) => {
    await route.fulfill({
      contentType: "text/javascript",
      body: `window.naver={maps:{LatLng:class{},Event:{addListener(){return{}},removeListener(){}},Map:class{constructor(element){element.innerHTML='<canvas data-fake-naver-map width="20" height="20"></canvas>'}setCenter(){}setZoom(){}destroy(){}}}};setTimeout(()=>window.navermap_authFailure?.(),0)`,
    })
  })

  await page.goto("/")

  await expect(page.locator('[role="alert"][data-tone="error"]')).toContainText(
    "NAVER 지도를 불러올 수 없습니다",
  )
  await expect(page.getByText("NAVER 지도 연결됨")).toHaveCount(0)
  await expect(page.locator("[data-field-guide-map]")).toHaveCount(0)
  await expect(page.getByTestId("naver-map").locator(":scope > *")).toHaveCount(0)
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(0)
})
