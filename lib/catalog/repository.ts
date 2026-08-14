import type { Menu, Place } from "../domain/catalog.ts"
import { parseMenuRows, parsePlaceRows } from "../domain/catalog.ts"

export type PublicCatalog = { readonly places: readonly Place[]; readonly menus: readonly Menu[] }

export interface SupabaseCatalogClient {
  selectPublishedPlaces(): Promise<unknown>
  selectPublishedMenus(): Promise<unknown>
}

export interface PublicCatalogRepository {
  getPublicCatalog(): Promise<PublicCatalog>
}

export const createPublicCatalogRepository = (
  client: SupabaseCatalogClient,
): PublicCatalogRepository => ({
  getPublicCatalog: async () => {
    const [placeRows, menuRows] = await Promise.all([
      client.selectPublishedPlaces(),
      client.selectPublishedMenus(),
    ])
    const places = parsePlaceRows(toRows(placeRows))
    const menus = parseMenuRows(toRows(menuRows))
    const placeById = new Map(places.map((place) => [place.id, place]))
    const isPublic =
      places.every((place) => place.published) &&
      menus.every((menu) => {
        const parent = placeById.get(menu.placeId)
        return menu.published && parent !== undefined && parent.dataMode === menu.dataMode
      })
    const mode = places[0]?.dataMode ?? menus[0]?.dataMode
    const isSingleMode =
      mode === undefined ||
      (places.every((place) => place.dataMode === mode) &&
        menus.every((menu) => menu.dataMode === mode))
    if (!isPublic || !isSingleMode) throw new PublicCatalogIntegrityError()
    return { places, menus }
  },
})

const toRows = (input: unknown): readonly unknown[] => {
  if (Array.isArray(input)) return input
  throw new PublicCatalogIntegrityError()
}

export class PublicCatalogIntegrityError extends Error {
  readonly name = "PublicCatalogIntegrityError"

  constructor() {
    super("Supabase returned a catalog that violates the public read contract")
  }
}
