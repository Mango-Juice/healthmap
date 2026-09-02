import { type ChildProcess, spawn } from "node:child_process"
import { cp, lstat, mkdtemp, rm } from "node:fs/promises"
import { basename, dirname, join } from "node:path"

export type FixtureServer = {
  readonly appDirectory: string
  readonly baseUrl: string
  readonly process: ChildProcess
}

const fixtureSourceDirectory = join(process.cwd(), "tests/fixtures/task7-app")
const fixtureParentDirectory = dirname(fixtureSourceDirectory)
const fixtureDirectoryPrefix = ".task7-app-"
const localUrlPattern = /http:\/\/127\.0\.0\.1:(\d+)/

const waitForAssignedBaseUrl = async (childProcess: ChildProcess): Promise<string> =>
  new Promise((resolve, reject) => {
    const stdout = childProcess.stdout
    if (stdout === null) {
      reject(new TypeError("Fixture server stdout is unavailable"))
      return
    }
    let output = ""
    const settle = (): void => {
      stdout.off("data", readOutput)
      childProcess.off("exit", handleExit)
    }
    const handleExit = (exitCode: number | null): void => {
      settle()
      reject(new TypeError(`Fixture server exited before binding with ${exitCode}`))
    }
    const readOutput = (chunk: Buffer): void => {
      output += chunk.toString("utf8")
      const match = localUrlPattern.exec(output)
      const portText = match?.[1]
      if (portText === undefined) return
      const port = Number(portText)
      if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        settle()
        reject(new TypeError(`Fixture server reported an invalid port: ${portText}`))
        return
      }
      settle()
      stdout.resume()
      resolve(`http://127.0.0.1:${port}`)
    }
    stdout.on("data", readOutput)
    childProcess.once("exit", handleExit)
  })

const waitForFixtureServer = async (baseUrl: string, childProcess: ChildProcess): Promise<void> => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (childProcess.exitCode !== null)
      throw new TypeError(`Fixture server exited with ${childProcess.exitCode}`)
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 125))
  }
  throw new TypeError("Fixture server did not become ready")
}

export const stopFixtureServer = async (server: FixtureServer): Promise<void> => {
  if (server.process.exitCode === null)
    await new Promise<void>((resolve) => {
      server.process.once("exit", () => resolve())
      server.process.kill("SIGTERM")
    })

  if (
    dirname(server.appDirectory) !== fixtureParentDirectory ||
    !basename(server.appDirectory).startsWith(fixtureDirectoryPrefix)
  )
    throw new TypeError(`Refusing to remove unexpected fixture path: ${server.appDirectory}`)
  const fixtureStats = await lstat(server.appDirectory)
  if (!fixtureStats.isDirectory() || fixtureStats.isSymbolicLink())
    throw new TypeError(`Refusing to remove non-directory fixture path: ${server.appDirectory}`)
  await rm(server.appDirectory, { force: true, recursive: true })
}

export const startFixtureServer = async (): Promise<FixtureServer> => {
  const appDirectory = await mkdtemp(join(fixtureParentDirectory, fixtureDirectoryPrefix))
  await cp(fixtureSourceDirectory, appDirectory, { recursive: true })
  const fixtureProcess = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      appDirectory,
      "--hostname",
      "127.0.0.1",
      "--port",
      "0",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS: "1",
        NEXT_PUBLIC_NAVER_MAP_CLIENT_ID: "test-client",
        NEXT_PUBLIC_POSTHOG_HOST: "http://127.0.0.1:3498",
        NEXT_PUBLIC_POSTHOG_KEY: "task7-fixture-key",
        NEXT_PUBLIC_PLAYWRIGHT_TEST: "1",
        NEXT_PUBLIC_TEST_ALLOW_HTTP_LOOPBACK: "1",
      },
      stdio: ["ignore", "pipe", "inherit"],
    },
  )
  try {
    const baseUrl = await waitForAssignedBaseUrl(fixtureProcess)
    const fixture = { appDirectory, baseUrl, process: fixtureProcess }
    await waitForFixtureServer(baseUrl, fixtureProcess)
    return fixture
  } catch (error) {
    await stopFixtureServer({ appDirectory, baseUrl: "", process: fixtureProcess })
    throw error
  }
}
