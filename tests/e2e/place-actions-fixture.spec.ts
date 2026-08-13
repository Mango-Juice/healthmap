import { type ChildProcess, spawn } from "node:child_process"
import { readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { join } from "node:path"
import { expect, test } from "@playwright/test"

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
})

test("Given a route-incomplete browser state, when directions is selected for the typed production fixture, then the UI opens its stored NAVER place fallback", async ({
  page,
}) => {
  // Given
  const server = fixtureServer
  if (server === undefined) throw new Error("Fixture server was not started")
  await page.addInitScript(() => {
    const originalIsFinite = Number.isFinite
    Object.defineProperty(Number, "isFinite", {
      configurable: true,
      value: (value: unknown): boolean => value !== 37.5032 && originalIsFinite(value),
    })
  })
  await page.goto(server.baseUrl)
  await page.getByRole("button", { name: "테스트 생산 경로 식당" }).click()

  // When
  const popup = page.waitForEvent("popup")
  await page.getByRole("button", { name: "길찾기" }).click()

  // Then
  const directionsPage = await popup
  await expect(directionsPage).toHaveURL("https://map.naver.com/p/entry/place/912345678")
})

test("Given an actual unpublished production fixture URL, when the map loads, then it recovers to the base map with a nonblocking notice", async ({
  page,
}) => {
  // Given
  const server = fixtureServer
  if (server === undefined) throw new Error("Fixture server was not started")

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
