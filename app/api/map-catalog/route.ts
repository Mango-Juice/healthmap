import catalogSource from "../../../data/catalog.json"

export const dynamic = "force-dynamic"

export function GET() {
  return Response.json({ data_mode: catalogSource.data_mode, places: catalogSource.places })
}
