import { type ChildProcess, spawn } from "node:child_process"
import { readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { join } from "node:path"
import { gunzipSync } from "node:zlib"
import { expect, test } from "@playwright/test"

test.describe.configure({ retries: 0 })

type FixtureServer = {
  readonly baseUrl: string
  readonly distDirectory: string
  readonly process: ChildProcess
  readonly tsconfigContents: string
}

let fixtureServer: FixtureServer | undefined

const fixtureNextEnvPath = join(process.cwd(), "tests/fixtures/task7-app/next-env.d.ts")
const fixtureTsconfigPath = join(process.cwd(), "tests/fixtures/task7-app/tsconfig.json")
const fixtureNextEnvContent = `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
`

const isCatalogResponse = (value: unknown): value is { readonly places: readonly unknown[] } =>
  typeof value === "object" && value !== null && "places" in value && Array.isArray(value.places)

type AnalyticsEvent = {
  readonly event: string
  readonly properties: Record<string, unknown>
}

const parseAnalyticsEvents = (postData: Buffer | null): readonly AnalyticsEvent[] => {
  if (postData === null) return []
  const decoded = postData[0] === 0x1f && postData[1] === 0x8b ? gunzipSync(postData) : postData
  const payload: unknown = JSON.parse(decoded.toString("utf8"))
  if (typeof payload !== "object" || payload === null || !("batch" in payload)) return []
  if (!Array.isArray(payload.batch)) return []
  return payload.batch.flatMap((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("event" in entry) ||
      typeof entry.event !== "string" ||
      !("properties" in entry) ||
      typeof entry.properties !== "object" ||
      entry.properties === null ||
      Array.isArray(entry.properties)
    )
      return []
    return [{ event: entry.event, properties: entry.properties }]
  })
}

const getAvailablePort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const socket = createServer()
    socket.once("error", reject)
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address()
      socket.close((error) => {
        if (error !== undefined) {
          reject(error)
          return
        }
        if (typeof address === "object" && address !== null) {
          resolve(address.port)
          return
        }
        reject(new TypeError("Fixture server did not receive a TCP port"))
      })
    })
  })

const waitForFixtureServer = async (baseUrl: string, process: ChildProcess): Promise<void> => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (process.exitCode !== null) throw new Error(`Fixture server exited with ${process.exitCode}`)
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 125))
  }
  throw new Error("Fixture server did not become ready")
}

const startFixtureServer = async (): Promise<FixtureServer> => {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const distDirectory = `.next-task7-${port}`
  const tsconfigContents = await readFile(fixtureTsconfigPath, "utf8")
  const fixtureProcess = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "tests/fixtures/task7-app",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS: "1",
        NEXT_PUBLIC_POSTHOG_HOST: `${baseUrl}/posthog`,
        NEXT_PUBLIC_POSTHOG_KEY: "task7-fixture-key",
        NEXT_PUBLIC_PLAYWRIGHT_TEST: "1",
        NEXT_PUBLIC_TEST_ALLOW_HTTP_LOOPBACK: "1",
        TASK7_FIXTURE_DIST_DIR: distDirectory,
      },
      stdio: "pipe",
    },
  )
  const fixture = { baseUrl, distDirectory, process: fixtureProcess, tsconfigContents }
  await waitForFixtureServer(baseUrl, fixtureProcess)
  return fixture
}

const stopFixtureServer = async (server: FixtureServer): Promise<void> => {
  if (server.process.exitCode === null)
    await new Promise<void>((resolve) => {
      server.process.once("exit", () => resolve())
      server.process.kill("SIGTERM")
    })
  await rm(join(process.cwd(), "tests/fixtures/task7-app", server.distDirectory), {
    force: true,
    recursive: true,
  })
  await writeFile(fixtureNextEnvPath, fixtureNextEnvContent)
  await writeFile(fixtureTsconfigPath, server.tsconfigContents)
}

test.beforeAll(async () => {
  fixtureServer = await startFixtureServer()
})

test.afterAll(async () => {
  if (fixtureServer !== undefined) await stopFixtureServer(fixtureServer)
})

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
})

test("Given the typed published production fixture, when directions is selected, then the UI opens the exact NAVER walking target", async ({
  page,
}) => {
  // Given
  const server = fixtureServer
  if (server === undefined) throw new Error("Fixture server was not started")
  await page.goto(server.baseUrl)
  await page.getByRole("button", { name: "테스트 생산 경로 식당" }).click()

  // When
  const popup = page.waitForEvent("popup")
  await page.getByRole("button", { name: "길찾기" }).click()

  // Then
  const directionsPage = await popup
  await expect(directionsPage).toHaveURL(
    "https://map.naver.com/p/directions/127.0311,37.5032,place,%ED%85%8C%EC%8A%A4%ED%8A%B8%20%EC%83%9D%EC%82%B0%20%EA%B2%BD%EB%A1%9C%20%EC%8B%9D%EB%8B%B9/-/walk",
  )
  await directionsPage.close()
})

test("Given a typed production fixture detail, when it is opened, then detail copy contains no sample wording", async ({
  page,
}) => {
  const server = fixtureServer
  if (server === undefined) throw new Error("Fixture server was not started")
  await page.goto(server.baseUrl)
  await page.getByRole("button", { name: "테스트 생산 경로 식당" }).click()

  const detail = page.getByTestId("place-detail")
  await expect(detail.getByText("장소 정보", { exact: true })).toBeVisible()
  await expect(detail.getByRole("region", { name: "건강식 메뉴" })).toBeVisible()
  await expect(detail).not.toContainText("샘플")
  await expect(detail).not.toHaveAttribute("aria-label", /샘플/)
  await expect(detail.locator("[aria-label*='샘플']")).toHaveCount(0)
})

test("Given the typed production fixture, when directions opens, then its redacted transport event is emitted", async ({
  page,
}) => {
  const server = fixtureServer
  if (server === undefined) throw new Error("Fixture server was not started")
  const events: AnalyticsEvent[] = []
  await page.route(`${server.baseUrl}/posthog/**`, async (route) => {
    const body = route.request().postDataBuffer()
    events.push(...parseAnalyticsEvents(body))
    await route.fulfill({ status: 200, body: '{"status":1}' })
  })
  await page.goto(server.baseUrl)
  await page.getByRole("button", { name: "테스트 생산 경로 식당" }).click()
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
    "https://map.naver.com/p/directions/",
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
  const server = fixtureServer
  if (server === undefined) throw new Error("Fixture server was not started")
  await page.goto(server.baseUrl)
  await page.getByRole("button", { name: "테스트 저장 장소 식당" }).click()

  // When
  const popup = page.waitForEvent("popup")
  await page.getByRole("button", { name: "길찾기" }).click()

  // Then
  const directionsPage = await popup
  await expect(directionsPage).toHaveURL("https://map.naver.com/p/entry/place/912345679")
  await directionsPage.close()
})

test("Given an actual unpublished production fixture URL, when the map loads, then it recovers to the base map with a nonblocking notice", async ({
  page,
}) => {
  // Given
  let server = fixtureServer
  if (server === undefined) throw new Error("Fixture server was not started")
  await stopFixtureServer(server)
  fixtureServer = await startFixtureServer()
  server = fixtureServer
  const recoveryPage = await page.context().newPage()

  // When
  await recoveryPage.goto(server.baseUrl, { waitUntil: "commit" })
  await recoveryPage.evaluate(() => {
    window.history.pushState({}, "", "/?place=task7-unpublished-place&src=place_share")
  })
  await recoveryPage.reload({ waitUntil: "commit" })

  // Then
  await expect(recoveryPage).toHaveURL(`${server.baseUrl}/`)
  await expect(
    recoveryPage.getByText("유효하지 않은 장소 링크를 기본 지도로 복구했습니다."),
  ).toBeVisible()
  await recoveryPage.close()
})

test("Given an actual unpublished production fixture, when the recovered map is rendered, then the unpublished record is not selectable", async ({
  page,
}) => {
  // Given
  const server = fixtureServer
  if (server === undefined) throw new Error("Fixture server was not started")

  // When
  await page.goto(server.baseUrl)

  // Then
  await expect(page.getByRole("button", { name: "테스트 비공개 식당" })).toHaveCount(0)
})

test("Given the normal application runtime, when the fixture suite completes, then only the five committed mock records remain", async ({
  page,
}) => {
  // Given / When
  const catalogResponse = await page.request.get("/api/map-catalog")
  await page.goto("/")

  // Then
  expect(catalogResponse.ok()).toBe(true)
  const catalog: unknown = await catalogResponse.json()
  if (!isCatalogResponse(catalog))
    throw new TypeError("Normal catalog response has no places array")
  expect(catalog.places).toHaveLength(5)
  await expect(page.getByRole("button", { name: /샘플/ })).toHaveCount(5)
  await expect(page.getByRole("button", { name: "테스트 생산 경로 식당" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "테스트 비공개 식당" })).toHaveCount(0)
})
