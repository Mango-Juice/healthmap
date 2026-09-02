import { readFile } from "node:fs/promises"
import { createServer } from "node:https"
import { createProductionCatalog } from "../deployment/catalog-fixture.mjs"

const port = Number.parseInt(process.env["HOSTED_FIXTURE_PORT"] ?? "0", 10)
const keyPath = process.env["HOSTED_FIXTURE_KEY"]
const certificatePath = process.env["HOSTED_FIXTURE_CERT"]
if (!keyPath || !certificatePath) throw new Error("hosted fixture TLS paths are required")

const catalog = createProductionCatalog()
const server = createServer(
  { key: await readFile(keyPath), cert: await readFile(certificatePath) },
  (request, response) => {
    if (request.method === "POST" && request.url === "/api/map-catalog") {
      response.writeHead(405, { "content-type": "application/json" }).end('{"error":"method"}')
      return
    }
    if (request.method !== "GET") {
      response.writeHead(405).end()
      return
    }
    if (request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      response.end("<main><h1>건강식 지도</h1></main>")
      return
    }
    if (request.url === "/privacy") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      response.end("<main><h1>개인정보 및 분석 안내</h1></main>")
      return
    }
    if (request.url === "/api/map-catalog") {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify(catalog))
      return
    }
    response.writeHead(404).end()
  },
)

server.listen(port, "127.0.0.1", () => {
  const address = server.address()
  if (typeof address === "object" && address) console.log(`READY https://127.0.0.1:${address.port}`)
})

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
