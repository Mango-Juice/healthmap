import { disableGeolocation } from "./analytics-transport"
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

test("Given an actual unpublished production fixture URL, when the map loads, then it recovers to the base map with a nonblocking notice", async ({
  page,
}) => {
  // Given
  const server = getFixtureServer()

  // When
  await page.goto(`${server.baseUrl}/?place=task7-unpublished-place&src=place_share`)

  // Then
  await expect(page).toHaveURL(`${server.baseUrl}/`)
  await expect(page.getByText("유효하지 않은 장소 링크를 기본 지도로 복구했습니다.")).toBeVisible()
})

test("Given an actual unpublished production fixture, when the recovered map is rendered, then the unpublished record is not selectable", async ({
  page,
}) => {
  // Given
  const server = getFixtureServer()

  // When
  await page.goto(server.baseUrl)

  // Then
  await expect(page.getByRole("button", { name: "테스트 비공개 식당" })).toHaveCount(0)
})

test("Given the normal application runtime without Supabase, when the fixture suite completes, then no test records leak into the app", async ({
  page,
}) => {
  // Given / When
  const catalogResponse = await page.request.get("/api/places?mode=places&limit=50")
  await page.goto("/")

  // Then
  expect(catalogResponse.status()).toBe(200)
  await expect(page.getByRole("button", { name: "새싹 네모식당 자세히 보기" })).toBeVisible()
  await expect(page.getByRole("button", { name: "테스트 생산 경로 식당" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "테스트 비공개 식당" })).toHaveCount(0)
})
