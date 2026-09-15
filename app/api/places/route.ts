import { reportDiscoveryFailure } from "../../../lib/discovery/diagnostics"
import { parseDiscoveryQuery } from "../../../lib/discovery/query-contract"
import { DiscoveryReadError, queryDiscovery } from "../../../lib/discovery/server"

export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  const startedAt = performance.now()
  const headers = { "Cache-Control": "private, no-store" }
  const query = parseDiscoveryQuery(new URL(request.url).searchParams)
  if (!query.success)
    return Response.json({ error: "invalid_request", retry: false }, { status: 400, headers })
  try {
    const result = await queryDiscovery(query.data, request.signal)
    return Response.json(result, { headers })
  } catch (error) {
    if (error instanceof DiscoveryReadError && error.kind === "invalid_request")
      return Response.json({ error: "invalid_request", retry: false }, { status: 400, headers })
    if (error instanceof DiscoveryReadError && error.kind === "stale_cursor")
      return Response.json({ error: "stale_cursor", retry: true }, { status: 409, headers })
    reportDiscoveryFailure(query.data.mode, error, startedAt)
    return Response.json(
      { error: "catalog_unavailable", retry: true },
      { status: 503, headers: { ...headers, "Retry-After": "1" } },
    )
  }
}
