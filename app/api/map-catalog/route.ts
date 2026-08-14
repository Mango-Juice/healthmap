import { getPublicCatalogRuntimeProvider, isCatalogMode } from "../../../lib/catalog/runtime"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const provider = getPublicCatalogRuntimeProvider()
    const catalog = await provider.read()
    if (!isCatalogMode(catalog, provider.mode)) return Response.json({}, { status: 503 })
    return Response.json({ dataMode: provider.mode, menus: catalog.menus, places: catalog.places })
  } catch {
    return Response.json({}, { status: 503 })
  }
}
