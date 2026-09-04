import { PlaceIdSchema } from "../../../../../lib/domain/contracts"
import { menusForPilotPlace } from "../../../../../lib/pilot/discovery"
import { isPilotEnabled } from "../../../../../lib/pilot/environment"
import { toPilotMenuDto, toPilotPlaceDto } from "../../../../../lib/pilot/projection"
import { readPilotCatalog } from "../../../../../lib/pilot/server"

export const dynamic = "force-dynamic"
export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  const headers = { "Cache-Control": "private, no-store" }
  if (!isPilotEnabled(process.env))
    return Response.json({ error: "not_found", retry: false }, { status: 404, headers })
  const id = PlaceIdSchema.safeParse((await context.params).id)
  if (!id.success)
    return Response.json({ error: "invalid_request", retry: false }, { status: 400, headers })
  const catalog = readPilotCatalog()
  if (catalog === null)
    return Response.json({ error: "catalog_unavailable", retry: true }, { status: 503, headers })
  const place = catalog.places.find((place) => place.id === id.data)
  const menus = menusForPilotPlace(catalog, id.data)
  if (!place || menus.length === 0)
    return Response.json({ error: "not_found", retry: false }, { status: 404, headers })
  return Response.json(
    {
      catalogVersion: catalog.catalogVersion,
      place: toPilotPlaceDto(place),
      menus: menus.map(toPilotMenuDto),
    },
    { headers },
  )
}
