import { expect, test } from "./map-test"

test("shows an error instead of a synthetic map when NAVER authorization fails", async ({
  page,
}) => {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  await page.route("https://oapi.map.naver.com/**", async (route) => {
    await route.fulfill({
      contentType: "text/javascript",
      body: `(()=>{let invalidated=false;const Event={addListener(){return{}},removeListener(){if(invalidated)throw new TypeError("Cannot read properties of null (reading 'isArray')")}};class Map{constructor(element){element.innerHTML='<canvas data-fake-naver-map width="20" height="20"></canvas>'}setCenter(){}setZoom(){}destroy(){}}window.naver={maps:{LatLng:class{},Event,Map}};setTimeout(()=>{invalidated=true;window.navermap_authFailure?.()},0)})()`,
    })
  })

  await page.goto("/")

  await expect(page.locator('[role="alert"][data-tone="error"]')).toContainText(
    "지도를 불러오지 못했어요.",
  )
  await expect(page.getByText("NAVER 지도 연결됨")).toHaveCount(0)
  await expect(page.locator("[data-field-guide-map]")).toHaveCount(0)
  await expect(page.getByTestId("naver-map").locator(":scope > *")).toHaveCount(0)
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(0)
  await expect(pageErrors).toEqual([])
  await expect(consoleErrors.filter((message) => message.includes("isArray"))).toEqual([])

  await page.getByRole("button", { name: "다시 시도" }).click()

  await expect(page.locator('[role="alert"][data-tone="error"]')).toContainText(
    "지도를 불러오지 못했어요.",
  )
  await expect(pageErrors).toEqual([])
  await expect(consoleErrors.filter((message) => message.includes("isArray"))).toEqual([])
})
