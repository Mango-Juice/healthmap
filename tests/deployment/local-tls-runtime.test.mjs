import assert from "node:assert/strict"
import { existsSync, mkdtempSync } from "node:fs"
import { request } from "node:https"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { createLocalTlsMaterial } from "../fixtures/local-tls-runtime.mts"

test("local TLS material serves a trusted loopback response and is removed on cleanup", async () => {
  const material = createLocalTlsMaterial()
  const server = (await import("node:https")).createServer(
    { cert: material.certificate, key: material.privateKey },
    (_incoming, response) => response.end("ready"),
  )
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", resolve)
    })
    const address = server.address()
    assert(address !== null && typeof address === "object")
    const body = await new Promise((resolve, reject) => {
      const outgoing = request(
        {
          ca: material.certificate,
          hostname: "127.0.0.1",
          method: "GET",
          path: "/health",
          port: address.port,
        },
        (response) => {
          let value = ""
          response.setEncoding("utf8")
          response.on("data", (chunk) => {
            value += chunk
          })
          response.on("end", () => resolve(value))
        },
      )
      outgoing.once("error", reject)
      outgoing.end()
    })
    assert.equal(body, "ready")
  } finally {
    await new Promise((resolve) => server.close(resolve))
    material.cleanup()
  }
  assert.equal(existsSync(material.root), false)
})

test("local TLS setup removes its owned directory when certificate generation fails", () => {
  const root = mkdtempSync(join(tmpdir(), "healthmap-local-tls-failure-"))
  assert.throws(() =>
    createLocalTlsMaterial({ opensslCommand: "/definitely-missing-openssl", root }),
  )
  assert.equal(existsSync(root), false)
})
