import { createHash } from "node:crypto"
import { z } from "zod"
import type { PilotCatalog } from "./catalog"
import { filterPilotPlaces, menusForPilotPlace } from "./discovery"
import type { PilotPlacesResponse, PilotRegionsResponse } from "./dto"
import { regionForPlace, toPilotMenuDto, toPilotPlaceDto } from "./projection"
import type { PilotQuery } from "./query-contract"
import { canonicalPilotRegion } from "./region"

const CursorSchema = z.strictObject({
  version: z.string(),
  query: z.string(),
  offset: z.number().int().min(0),
})
export type PilotQueryError = {
  readonly error: "invalid_request" | "stale_cursor"
  readonly retry: boolean
}
export const queryPilotCatalog = (
  catalog: PilotCatalog,
  query: PilotQuery,
): PilotPlacesResponse | PilotRegionsResponse | PilotQueryError => {
  const { cursor, ...identity } = query
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(["region-aliases-v1", identity, catalog.menus.map((menu) => menu.id)]))
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
    if (parsed.data.version !== catalog.catalogVersion || parsed.data.query !== fingerprint)
      return { error: "stale_cursor", retry: true }
    offset = parsed.data.offset
  }
  const appliedBounds =
    query.south !== undefined &&
    query.north !== undefined &&
    query.west !== undefined &&
    query.east !== undefined
      ? {
          southWest: { latitude: query.south, longitude: query.west },
          northEast: { latitude: query.north, longitude: query.east },
        }
      : undefined
  const results = filterPilotPlaces({
    catalog,
    filter: query.filter,
    ingredient: query.ingredient,
    query: query.query,
    appliedBounds,
  })
    .filter(
      ({ place }) =>
        query.region === undefined || regionForPlace(place) === canonicalPilotRegion(query.region),
    )
    .sort((a, b) => a.place.id.localeCompare(b.place.id))
  if (query.mode === "regions") {
    const groups = new Map<string, typeof results>()
    for (const result of results) {
      const region = regionForPlace(result.place)
      groups.set(region, [...(groups.get(region) ?? []), result])
    }
    return {
      catalogVersion: catalog.catalogVersion,
      total: results.length,
      regions: Array.from(groups, ([id, entries]) => ({
        id,
        label: id,
        count: entries.length,
        bounds: {
          southWest: {
            latitude: Math.min(...entries.map(({ place }) => place.latitude)),
            longitude: Math.min(...entries.map(({ place }) => place.longitude)),
          },
          northEast: {
            latitude: Math.max(...entries.map(({ place }) => place.latitude)),
            longitude: Math.max(...entries.map(({ place }) => place.longitude)),
          },
        },
      })).sort((a, b) => a.id.localeCompare(b.id)),
    }
  }
  if (offset > results.length) return { error: "stale_cursor", retry: true }
  const nextOffset = offset + query.limit
  return {
    catalogVersion: catalog.catalogVersion,
    total: results.length,
    results: results.slice(offset, nextOffset).map((result) => ({
      place: toPilotPlaceDto(result.place),
      matchingMenuIds: result.matchingMenuIds,
      menus: menusForPilotPlace(catalog, result.place.id)
        .filter((menu) => result.matchingMenuIds.includes(menu.id))
        .map(toPilotMenuDto),
    })),
    nextCursor:
      nextOffset < results.length
        ? Buffer.from(
            JSON.stringify({
              version: catalog.catalogVersion,
              query: fingerprint,
              offset: nextOffset,
            }),
          ).toString("base64url")
        : null,
  }
}
