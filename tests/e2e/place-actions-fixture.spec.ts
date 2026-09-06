import {
  analyticsHosts,
  disableGeolocation,
  parseAnalyticsTransportEvents,
  type TransportEvent,
} from "./analytics-transport"
import { expect, test } from "./map-test"
import {
  type FixtureServer,
  startFixtureServer,
  stopFixtureServer,
} from "./place-actions-fixture-server"

test.describe.configure({ retries: 0 })

let fixtureServer: FixtureServer | undefined

const getFixtureServer = (): FixtureServer => {
  if (fixtureServer === undefined) throw new TypeError("Fixture server was not started")
  return fixtureServer
}

test.beforeAll(async () => {
  fixtureServer = await startFixtureServer()
})

test.afterAll(async () => {
  if (fixtureServer !== undefined) await stopFixtureServer(fixtureServer)
})

test.beforeEach(async ({ context }) => {
  await disableGeolocation(context)
})

test("Given the typed published production fixture, when directions is selected, then the UI opens the exact NAVER destination target", async ({
  page,
}) => {
  const context = page.context()
  await context.route("https://map.naver.com/index.nhn?**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Directions target</title>",
    }),
  )
  // Given
  const server = getFixtureServer()
  await page.goto(server.baseUrl)
  await page.getByRole("button", { name: "테스트 생산 경로 식당 상세 보기" }).click()

  // When
  const popup = page.waitForEvent("popup")
  await page.getByRole("button", { name: "길찾기" }).click()

  // Then
  const directionsPage = await popup
  await expect(directionsPage).toHaveURL(
    "https://map.naver.com/index.nhn?elng=127.0311&elat=37.5032&etext=%ED%85%8C%EC%8A%A4%ED%8A%B8+%EC%83%9D%EC%82%B0+%EA%B2%BD%EB%A1%9C+%EC%8B%9D%EB%8B%B9&menu=route",
  )
  await directionsPage.close()
})

test("Given a typed production fixture detail, when it is opened, then its published place and menu details are explicit", async ({
  page,
}) => {
  // Given
  const server = getFixtureServer()
  await page.goto(server.baseUrl)
  await page.getByRole("button", { name: "테스트 생산 경로 식당 상세 보기" }).click()

  // When
  const detail = page.getByTestId("place-detail")

  // Then
  await expect(detail.getByText("장소 정보", { exact: true })).toBeVisible()
  await expect(detail.getByRole("heading", { name: "테스트 생산 경로 식당" })).toBeVisible()
  await expect(detail.getByText("서울 강남구 테스트로 7길 1", { exact: true })).toBeVisible()
  await expect(detail.getByText("2가지", { exact: true })).toBeVisible()
  await expect(detail.getByRole("region", { name: "건강식 메뉴" })).toBeVisible()
  await expect(detail.getByText("테스트 생산 메뉴 하나", { exact: true })).toBeVisible()
  await expect(detail.getByText("테스트 생산 메뉴 둘", { exact: true })).toBeVisible()
})

test("Given the typed production fixture, when directions opens, then its redacted transport event is emitted", async ({
  page,
}) => {
  const server = getFixtureServer()
  const events: TransportEvent[] = []
  await page.addInitScript(() => {
    localStorage.setItem("healthmap.analytics.opt-out.v1", "false")
  })
  await page.route(`${analyticsHosts[0]}/**`, async (route) => {
    events.push(...parseAnalyticsTransportEvents(route.request().postDataBuffer()))
    await route.fulfill({ status: 200, body: '{"status":1}' })
  })
  await page.goto(server.baseUrl)
  expect(await page.evaluate(() => localStorage.getItem("healthmap.analytics.opt-out.v1"))).toBe(
    "false",
  )
  await page.getByRole("button", { name: "테스트 생산 경로 식당 상세 보기" }).click()

  const popup = page.waitForEvent("popup")
  await page.getByRole("button", { name: "길찾기" }).click()
  const directionsPage = await popup
  await directionsPage.close()

  await expect
    .poll(() => events.filter((entry) => entry.event === "directions_opened").length)
    .toBe(1)
  const directions = events.filter((entry) => entry.event === "directions_opened")
  expect(directions).toEqual([
    {
      event: "directions_opened",
      properties: {
        place_id: "2a8039ba-6862-4bf5-882c-298892e7caf0",
        source: "naver_route",
      },
    },
  ])
  const redacted = JSON.stringify(directions[0]?.properties)
  for (const forbidden of [
    "latitude",
    "longitude",
    "lat",
    "lng",
    "coordinates",
    "url",
    "query",
    "referrer",
    "https://map.naver.com/index.nhn?",
    "서울 강남구 테스트로 7길 1",
    "테스트 생산 경로 식당",
    "테스트 생산 메뉴 하나",
  ])
    expect(redacted).not.toContain(forbidden)
})

test("Given a typed route-incomplete production fixture, when directions is selected, then the UI opens its stored NAVER place fallback", async ({
  page,
}) => {
  // Given
  const server = getFixtureServer()
  await page.goto(server.baseUrl)
  await page.getByTestId("naver-map").getByRole("button", { name: "테스트 저장 장소 식당" }).click()

  // When
  const popup = page.waitForEvent("popup")
  await page.getByRole("button", { name: "길찾기" }).click()

  // Then
  const directionsPage = await popup
  await expect(directionsPage).toHaveURL("https://map.naver.com/p/entry/place/912345679")
  await directionsPage.close()
})
