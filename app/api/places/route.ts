import { queryPilotCatalog } from "../../../lib/pilot/query"
import { parsePilotQuery } from "../../../lib/pilot/query-contract"
import { readPilotCatalog, readSubwayStoreCatalog } from "../../../lib/pilot/server"

export const dynamic = "force-dynamic"
export function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  const query = parsePilotQuery(new URL(request.url).searchParams)
  if (!query.success)
    return Response.json({ error: "invalid_request", retry: false }, { status: 400, headers })
  const catalog = readPilotCatalog()
  const subway = readSubwayStoreCatalog()
  if (catalog === null || subway === null)
    return Response.json({ error: "catalog_unavailable", retry: true }, { status: 503, headers })
  const result = queryPilotCatalog(catalog, query.data, subway)
  const status = "error" in result ? (result.error === "stale_cursor" ? 409 : 400) : 200
  return Response.json(result, { status, headers })
}
