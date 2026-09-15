import { reportDiscoveryFailure } from "../../../../lib/discovery/diagnostics"
import { DiscoveryReadError, getDiscoveryPlace } from "../../../../lib/discovery/server"
import { PlaceIdSchema } from "../../../../lib/domain/contracts"

export const dynamic = "force-dynamic"
export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  const startedAt = performance.now()
  const headers = { "Cache-Control": "private, no-store" }
  const id = PlaceIdSchema.safeParse((await context.params).id)
  if (!id.success)
    return Response.json({ error: "invalid_request", retry: false }, { status: 400, headers })
  try {
    const detail = await getDiscoveryPlace(id.data, _request.signal)
    if (detail === null)
      return Response.json({ error: "not_found", retry: false }, { status: 404, headers })
    return Response.json(detail, { headers })
  } catch (error) {
    if (error instanceof DiscoveryReadError && error.kind === "invalid_request")
      return Response.json({ error: "invalid_request", retry: false }, { status: 400, headers })
    reportDiscoveryFailure("detail", error, startedAt)
    return Response.json(
      { error: "catalog_unavailable", retry: true },
      { status: 503, headers: { ...headers, "Retry-After": "1" } },
    )
  }
}
