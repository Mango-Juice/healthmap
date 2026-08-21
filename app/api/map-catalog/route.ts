import { getPublicCatalogRuntimeProvider } from "../../../lib/catalog/runtime"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const provider = getPublicCatalogRuntimeProvider()
    const catalog = await provider.read()
    return Response.json({ dataMode: "production", menus: catalog.menus, places: catalog.places })
  } catch {
    return Response.json({}, { status: 503 })
  }
}
