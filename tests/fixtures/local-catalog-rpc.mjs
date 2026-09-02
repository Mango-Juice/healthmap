import { readFile } from "node:fs/promises"
import { createServer } from "node:https"
import { e2eCatalog } from "./e2e-catalog.ts"

const portText = process.env["LOCAL_CATALOG_PORT"] ?? ""
if (!/^[1-9]\d{0,4}$/u.test(portText)) throw new Error("LOCAL_CATALOG_PORT must be a TCP port")
const port = Number.parseInt(portText, 10)
if (port > 65_535) throw new Error("LOCAL_CATALOG_PORT must be a TCP port")

const server = createServer(
  {
    cert: await readFile(new URL("./local-catalog-certificate.pem", import.meta.url)),
    key: await readFile(new URL("./local-catalog-key.pem", import.meta.url)),
  },
  (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200).end("ready")
      return
    }
    if (request.method === "POST" && request.url === "/rest/v1/rpc/get_public_catalog") {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify(e2eCatalog))
      return
    }
    response.writeHead(request.method === "POST" ? 404 : 405).end()
  },
)

const shutdown = () => {
  server.close(() => process.exit(0))
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
server.listen(port, "127.0.0.1")
