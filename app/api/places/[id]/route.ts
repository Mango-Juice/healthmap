import { PlaceIdSchema } from "../../../../lib/domain/contracts"
import { menusForPilotPlace } from "../../../../lib/pilot/discovery"
import { toPilotMenuDto, toPilotPlaceDto, toSubwayStoreDto } from "../../../../lib/pilot/projection"
import { readPilotCatalog, readSubwayStoreCatalog } from "../../../../lib/pilot/server"
import { combinedPilotCatalogVersion } from "../../../../lib/pilot/subway"

export const dynamic = "force-dynamic"
export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  const headers = { "Cache-Control": "private, no-store" }
  const id = PlaceIdSchema.safeParse((await context.params).id)
  if (!id.success)
    return Response.json({ error: "invalid_request", retry: false }, { status: 400, headers })
  const catalog = readPilotCatalog()
  const subway = readSubwayStoreCatalog()
  if (catalog === null || subway === null)
    return Response.json({ error: "catalog_unavailable", retry: true }, { status: 503, headers })
  const place = catalog.places.find((place) => place.id === id.data)
  const menus = menusForPilotPlace(catalog, id.data)
  if (place && menus.length > 0)
    return Response.json(
      {
        catalogVersion: combinedPilotCatalogVersion(catalog.catalogVersion, subway),
        place: toPilotPlaceDto(place),
        menus: menus.map(toPilotMenuDto),
      },
      { headers },
    )
  const store = subway.stores.find((candidate) => candidate.id === id.data)
  if (!store) return Response.json({ error: "not_found", retry: false }, { status: 404, headers })
  return Response.json(
    {
      catalogVersion: combinedPilotCatalogVersion(catalog.catalogVersion, subway),
      place: toSubwayStoreDto(store),
      menus: [],
    },
    { headers },
  )
}
