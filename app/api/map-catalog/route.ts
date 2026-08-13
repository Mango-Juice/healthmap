import catalogSource from "../../../data/catalog.json"

export const dynamic = "force-dynamic"

export function GET() {
  return Response.json({ places: catalogSource.places })
}
