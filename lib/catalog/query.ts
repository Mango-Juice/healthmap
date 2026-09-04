import { createHash } from "node:crypto"
import { z } from "zod"
import type { Menu, Place, PublicCatalogSnapshot } from "../domain/catalog.ts"
import { matchingDiscoveryMenus } from "../domain/discovery.ts"
import { PlaceFilterSchema } from "../domain/filter.ts"
import { isInsideViewportBounds } from "../domain/viewport.ts"
import type {
  PublicCatalogQuery,
  PublicCatalogQueryResponse,
  PublicRegion,
} from "./query-contract.ts"

const CursorSchema = z.strictObject({
  version: z.string(),
  query: z.string(),
  offset: z.number().int().nonnegative(),
  expires: z.number().int(),
})
export type PublicQueryError = {
  readonly error: "invalid_request" | "stale_cursor"
  readonly retry: boolean
}
const regionForPlace = (place: Place): string => place.address.split(/\s+/u).slice(0, 2).join(" ")
const regionsForPlaces = (places: readonly Place[]): readonly PublicRegion[] => {
  const groups = new Map<string, PublicRegion>()
  for (const place of places) {
    const id = regionForPlace(place)
    const group = groups.get(id)
    groups.set(id, {
      id,
      label: id,
      count: (group?.count ?? 0) + 1,
      bounds: {
        southWest: {
          latitude: Math.min(group?.bounds.southWest.latitude ?? place.latitude, place.latitude),
          longitude: Math.min(
            group?.bounds.southWest.longitude ?? place.longitude,
            place.longitude,
          ),
        },
        northEast: {
          latitude: Math.max(group?.bounds.northEast.latitude ?? place.latitude, place.latitude),
          longitude: Math.max(
            group?.bounds.northEast.longitude ?? place.longitude,
            place.longitude,
          ),
        },
      },
    })
  }
  return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id))
}
export const queryPublicCatalog = (
  catalog: PublicCatalogSnapshot,
  query: PublicCatalogQuery,
): PublicCatalogQueryResponse | PublicQueryError => {
  const { cursor, ...identity } = query
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([identity, catalog.places, catalog.menus]))
    .digest("hex")
  let offset = 0
  if (cursor !== undefined) {
    let raw: unknown
    try {
      raw = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    } catch (error) {
      if (error instanceof SyntaxError) return { error: "invalid_request", retry: false }
      throw error
    }
    const parsed = CursorSchema.safeParse(raw)
    if (!parsed.success) return { error: "invalid_request", retry: false }
    if (
      parsed.data.version !== catalog.catalogVersion ||
      parsed.data.query !== fingerprint ||
      parsed.data.expires < Date.now()
    )
      return { error: "stale_cursor", retry: true }
    offset = parsed.data.offset
  }
  const bounds =
    query.south !== undefined &&
    query.north !== undefined &&
    query.west !== undefined &&
    query.east !== undefined
      ? {
          southWest: { latitude: query.south, longitude: query.west },
          northEast: { latitude: query.north, longitude: query.east },
        }
      : undefined
  const menusByPlace = new Map<Place["id"], Menu[]>()
  for (const menu of catalog.menus) {
    const entries = menusByPlace.get(menu.placeId) ?? []
    entries.push(menu)
    menusByPlace.set(menu.placeId, entries)
  }
  const candidates = catalog.places.filter(
    (place) =>
      place.published &&
      (bounds === undefined || isInsideViewportBounds(place, bounds)) &&
      (query.region === undefined || regionForPlace(place) === query.region),
  )
  const matches = (place: Place, tag = query.filter) =>
    matchingDiscoveryMenus({
      place,
      menus: menusByPlace.get(place.id) ?? [],
      query: query.query,
      tag,
      ingredient: query.ingredient,
      cooking: query.cooking,
    })
  const results = candidates
    .filter((place) => matches(place).length > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
  if (offset > results.length) return { error: "stale_cursor", retry: true }
  const places = query.mode === "regions" ? [] : results.slice(offset, offset + query.limit)
  return {
    catalogVersion: catalog.catalogVersion,
    dataMode: "production",
    places,
    menus: places.flatMap((place) => matches(place)),
    total: results.length,
    regions: regionsForPlaces(results),
    facets: PlaceFilterSchema.options.map((filter) => ({
      filter,
      count: candidates.filter((place) => matches(place, filter).length > 0).length,
    })),
    nextCursor:
      query.mode === "places" && offset + query.limit < results.length
        ? Buffer.from(
            JSON.stringify({
              version: catalog.catalogVersion,
              query: fingerprint,
              offset: offset + query.limit,
              expires: Date.now() + 300_000,
            }),
          ).toString("base64url")
        : null,
  }
}
