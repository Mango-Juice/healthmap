import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { createServer } from "node:http"
import { after, before, test } from "node:test"
import { promisify } from "node:util"
import { runProductionSmoke } from "../../scripts/deploy/production-smoke.mjs"

const executeFile = promisify(execFile)
let server
let baseUrl

before(async () => {
  server = createServer((request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405).end()
      return
    }

    if (request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end("건강식 지도")
      return
    }

    if (request.url === "/privacy") {
      response
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end("개인정보 및 분석 안내")
      return
    }

    if (
      request.url ===
      "/api/places?mode=places&filter=all&ingredient=all&limit=50&south=37.4&west=126.8&north=37.7&east=127.2"
    ) {
      response.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          catalogVersion: "current-release",
          nextCursor: null,
          results: [],
          sortBasis: "relevance",
          sortOrigin: null,
          total: 0,
        }),
      )
      return
    }

    if (
      request.url ===
      "/api/places?mode=places&filter=all&ingredient=all&limit=0&south=37.4&west=126.8&north=37.7&east=127.2"
    ) {
      response
        .writeHead(400, { "content-type": "application/json" })
        .end(JSON.stringify({ error: "invalid_request", retry: false }))
      return
    }

    response.writeHead(404).end()
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address === "object")
  baseUrl = new URL(`http://127.0.0.1:${address.port}`)
})

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
})

test("current smoke accepts the public discovery route and malformed-input boundary", async () => {
  assert.equal(await runProductionSmoke(baseUrl), "Production smoke passed")
})

test("smoke CLI succeeds against current HTTP behavior and rejects invalid configuration", async () => {
  const success = await executeFile(process.execPath, [
    "scripts/deploy/production-smoke.mjs",
    "--base-url",
    baseUrl.origin,
  ])
  assert.equal(success.stdout, "Production smoke passed\n")

  await assert.rejects(
    executeFile(process.execPath, ["scripts/deploy/production-smoke.mjs", "--base-url"]),
    (error) => error.code === 1 && error.stderr.includes("Smoke configuration invalid"),
  )
})
