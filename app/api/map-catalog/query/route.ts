import { queryPublicCatalog } from "../../../../lib/catalog/query"
import { parsePublicCatalogQuery } from "../../../../lib/catalog/query-contract"
import { getPublicCatalogRuntimeProvider } from "../../../../lib/catalog/runtime"

export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  const parsed = parsePublicCatalogQuery(new URL(request.url).searchParams)
  if (!parsed.success)
    return Response.json({ error: "invalid_request", retry: false }, { status: 400 })
  try {
    const result = queryPublicCatalog(await getPublicCatalogRuntimeProvider().read(), parsed.data)
    return Response.json(result, { status: "error" in result ? (result.retry ? 409 : 400) : 200 })
  } catch {
    return Response.json({}, { status: 503 })
  }
}
