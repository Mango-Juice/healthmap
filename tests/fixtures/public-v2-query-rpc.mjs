import { readFile } from "node:fs/promises"
import { createServer } from "node:https"
import { V2_CATALOG, V2_MENU, V2_PLACE } from "../unit/domain/catalog-v2-fixture.ts"

// Explicit synthetic QA fixture; never imported by production code.
const catalog = {
  ...V2_CATALOG,
  places: Array.from({ length: 55 }, (_, index) => ({
    ...V2_PLACE,
    id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    slug: `public-v2-test-${index}`,
    name: `공개 쿼리 시험 ${index}`,
  })),
  menus: Array.from({ length: 55 }, (_, index) => ({
    ...V2_MENU,
    id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    placeId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  })),
}
createServer(
  {
    cert: await readFile(new URL("./local-catalog-certificate.pem", import.meta.url)),
    key: await readFile(new URL("./local-catalog-key.pem", import.meta.url)),
  },
  (request, response) => {
    if (request.url === "/rest/v1/rpc/get_public_catalog" && request.method === "POST") {
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(catalog))
      return
    }
    response.writeHead(200).end("explicit-public-v2-test-fixture")
  },
).listen(14529, "127.0.0.1")
