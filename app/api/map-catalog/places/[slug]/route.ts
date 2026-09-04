import { getPublicCatalogRuntimeProvider } from "../../../../../lib/catalog/runtime"
import { PlaceSlugSchema } from "../../../../../lib/domain/contracts"

export const dynamic = "force-dynamic"
export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly slug: string }> },
) {
  const parsed = PlaceSlugSchema.safeParse((await context.params).slug)
  if (!parsed.success) return Response.json({}, { status: 400 })
  try {
    const catalog = await getPublicCatalogRuntimeProvider().read()
    const place = catalog.places.find((entry) => entry.slug === parsed.data)
    if (place === undefined) return Response.json({}, { status: 404 })
    return Response.json({
      catalogVersion: catalog.catalogVersion,
      dataMode: catalog.dataMode,
      place,
      menus: catalog.menus.filter((menu) => menu.placeId === place.id),
    })
  } catch {
    return Response.json({}, { status: 503 })
  }
}
