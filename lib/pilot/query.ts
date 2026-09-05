import { createHash } from "node:crypto"
import { z } from "zod"
import { normalizeDiscoveryQuery } from "../domain/discovery"
import { haversineDistanceMeters } from "../domain/distance"
import { isInsideViewportBounds } from "../domain/viewport"
import type { PilotCatalog, PilotMenu, PilotPlace } from "./catalog"
import { filterPilotPlaces, menusForPilotPlace } from "./discovery"
import type { PilotPlaceResultDto, PilotPlacesResponse, PilotRegionsResponse } from "./dto"
import { toPilotMenuDto, toPilotPlaceDto, toSubwayStoreDto } from "./projection"
import type { PilotQuery } from "./query-contract"
import { canonicalPilotRegion } from "./region"
import { combinedPilotCatalogVersion, type SubwayStore, type SubwayStoreCatalog } from "./subway"

const CursorSchema = z.strictObject({
  version: z.string(),
  query: z.string(),
  offset: z.number().int().min(0),
})
export type PilotQueryError = {
  readonly error: "invalid_request" | "stale_cursor"
  readonly retry: boolean
}
type MenuEvidenceResult = {
  readonly kind: "menu_evidence"
  readonly place: PilotPlace
  readonly matchingMenuIds: readonly PilotMenu["id"][]
}
type StoreOnlyResult = {
  readonly kind: "store_only"
  readonly place: SubwayStore
  readonly matchingMenuIds: readonly []
}
type CombinedResult = MenuEvidenceResult | StoreOnlyResult

const projectResult = (catalog: PilotCatalog, result: CombinedResult): PilotPlaceResultDto => {
  if (result.kind === "menu_evidence")
    return {
      place: toPilotPlaceDto(result.place),
      matchingMenuIds: result.matchingMenuIds,
      menus: menusForPilotPlace(catalog, result.place.id)
        .filter((menu) => result.matchingMenuIds.includes(menu.id))
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(toPilotMenuDto),
    }
  return {
    place: toSubwayStoreDto(result.place),
    matchingMenuIds: [],
    menus: [],
  }
}

const relevanceRank = (catalog: PilotCatalog, result: CombinedResult, query: string): number => {
  if (!query) return 0
  const name = normalizeDiscoveryQuery(result.place.name)
  if (name === query) return 0
  if (name.includes(query)) return 1
  if (
    result.kind === "menu_evidence" &&
    menusForPilotPlace(catalog, result.place.id).some(
      (menu) =>
        result.matchingMenuIds.includes(menu.id) &&
        normalizeDiscoveryQuery(menu.name).includes(query),
    )
  )
    return 2
  return 3
}

export const queryPilotCatalog = (
  catalog: PilotCatalog,
  query: PilotQuery,
  subway: SubwayStoreCatalog | undefined = undefined,
): PilotPlacesResponse | PilotRegionsResponse | PilotQueryError => {
  const subwayStores = subway?.stores ?? []
  const { cursor, ...identity } = query
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
  const normalizedQuery = normalizeDiscoveryQuery(query.query)
  const tokens = normalizedQuery.split(" ").filter(Boolean)
  const menuResults: readonly MenuEvidenceResult[] = filterPilotPlaces({
    catalog,
    filter: query.filter,
    ingredient: query.ingredient,
    query: query.query,
    appliedBounds,
  }).map((result) => ({
    kind: "menu_evidence",
    place: result.place,
    matchingMenuIds: [...result.matchingMenuIds].sort(),
  }))
  const storeResults: readonly StoreOnlyResult[] =
    query.filter === "all" && query.ingredient === "all"
      ? subwayStores.flatMap((store) => {
          if (appliedBounds !== undefined && !isInsideViewportBounds(store, appliedBounds))
            return []
          const searchable = normalizeDiscoveryQuery(
            [store.brandId, store.brandName, store.name, store.address, "샌드위치 매장"].join(" "),
          )
          if (!tokens.every((token) => searchable.includes(token))) return []
          return [
            {
              kind: "store_only",
              place: store,
              matchingMenuIds: [],
            },
          ]
        })
      : []
  const matchingResults = [...menuResults, ...storeResults].filter(
    ({ place }) =>
      query.region === undefined ||
      canonicalPilotRegion(place.address) === canonicalPilotRegion(query.region),
  )
  const catalogVersion = combinedPilotCatalogVersion(catalog.catalogVersion, subway)
  if (query.mode === "regions") {
    const groups = new Map<string, typeof matchingResults>()
    for (const result of matchingResults) {
      const region = canonicalPilotRegion(result.place.address)
      groups.set(region, [...(groups.get(region) ?? []), result])
    }
    return {
      catalogVersion,
      total: matchingResults.length,
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
  const sortBasis = appliedBounds
    ? "map_center"
    : query.region !== undefined
      ? "region_center"
      : "catalog_center"
  const sortOrigin =
    matchingResults.length === 0
      ? null
      : appliedBounds
        ? {
            latitude: (appliedBounds.southWest.latitude + appliedBounds.northEast.latitude) / 2,
            longitude: (appliedBounds.southWest.longitude + appliedBounds.northEast.longitude) / 2,
          }
        : {
            latitude:
              (Math.min(...matchingResults.map(({ place }) => place.latitude)) +
                Math.max(...matchingResults.map(({ place }) => place.latitude))) /
              2,
            longitude:
              (Math.min(...matchingResults.map(({ place }) => place.longitude)) +
                Math.max(...matchingResults.map(({ place }) => place.longitude))) /
              2,
          }
  const results = sortOrigin
    ? [...matchingResults].sort((left, right) => {
        const rank =
          relevanceRank(catalog, left, normalizedQuery) -
          relevanceRank(catalog, right, normalizedQuery)
        if (rank !== 0) return rank
        const distance =
          haversineDistanceMeters(sortOrigin, left.place) -
          haversineDistanceMeters(sortOrigin, right.place)
        return distance || left.place.id.localeCompare(right.place.id)
      })
    : matchingResults
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        "ordering-v1",
        { ...identity, query: normalizedQuery },
        sortBasis,
        sortOrigin,
        catalogVersion,
        catalog.menus.map((menu) => menu.id).sort(),
      ]),
    )
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
    if (parsed.data.version !== catalogVersion || parsed.data.query !== fingerprint)
      return { error: "stale_cursor", retry: true }
    offset = parsed.data.offset
  }
  if (offset > results.length) return { error: "stale_cursor", retry: true }
  const nextOffset = offset + query.limit
  return {
    catalogVersion,
    sortBasis,
    sortOrigin,
    total: results.length,
    results: results.slice(offset, nextOffset).map((result) => projectResult(catalog, result)),
    nextCursor:
      nextOffset < results.length
        ? Buffer.from(
            JSON.stringify({
              version: catalogVersion,
              query: fingerprint,
              offset: nextOffset,
            }),
          ).toString("base64url")
        : null,
  }
}
