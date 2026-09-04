import { writeFile } from "node:fs/promises"
import { expect, serverTest as test } from "../e2e/map-test"

test("direct published place preserves detail while bounded nearby discovery remains available", async ({
  page,
  context,
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) =>
          failure({
            code: 1,
            message: "fixture denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          }),
      },
    }),
  )
  await page.goto("/places/public-v2-test-54")
  await expect(page.getByTestId("place-detail")).toBeVisible()
  await expect(page.getByTestId("place-detail").getByRole("heading").first()).toContainText("54")
  await page.waitForFunction(() => Array.isArray(Reflect.get(window, "__healthMapTestMaps")))
  await page.evaluate(() => {
    const maps: unknown = Reflect.get(window, "__healthMapTestMaps")
    if (!Array.isArray(maps)) throw new Error("Missing test map")
    const map: unknown = maps.at(-1)
    if (typeof map !== "object" || map === null) throw new Error("Missing test map")
    const setBounds: unknown = Reflect.get(map, "setTestBounds")
    if (typeof setBounds !== "function") throw new Error("Missing bounds control")
    Reflect.apply(setBounds, map, [
      { latitude: 35.05, longitude: 129 },
      { latitude: 35.15, longitude: 129.1 },
    ])
  })
  const nearbyResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/map-catalog/query?") && response.url().includes("south=35.05"),
  )
  await page.getByRole("button", { name: "이 지역 검색", exact: true }).click()
  expect((await nearbyResponse).status()).toBe(200)
  await expect(page.getByTestId("place-detail").getByRole("heading").first()).toContainText("54")
  await expect(page).toHaveURL("http://127.0.0.1:4529/places/public-v2-test-54")
  await page.getByRole("button", { name: "검색 결과로 돌아가기", exact: true }).click()
  await expect(
    page.getByRole("list", { name: "검색 결과", exact: true }).getByRole("listitem"),
  ).toHaveCount(50)
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/map-catalog/query?") &&
      response.url().includes("ingredient=fish"),
  )
  await page.getByRole("combobox", { name: "재료", exact: true }).selectOption("fish")
  const response = await responsePromise
  const body: unknown = await response.json()
  await writeFile(
    ".omo/evidence/task7-query/direct-place/response.json",
    JSON.stringify({ status: response.status(), body }, null, 2),
  )
  expect(response.status()).toBe(200)
  await expect(
    page.getByRole("list", { name: "검색 결과", exact: true }).getByRole("listitem"),
  ).toHaveCount(50)
  await page.screenshot({ path: ".omo/evidence/task7-query/direct-place/results.png" })
})
