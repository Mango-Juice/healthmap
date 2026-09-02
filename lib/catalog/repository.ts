import { type PublicCatalogSnapshot, PublicCatalogSnapshotSchema } from "../domain/catalog.ts"

export type PublicCatalog = PublicCatalogSnapshot

export interface SupabaseCatalogClient {
  getPublicCatalogSnapshot(): Promise<unknown>
}

export interface PublicCatalogRepository {
  getPublicCatalog(): Promise<PublicCatalog>
}

export const createPublicCatalogRepository = (
  client: SupabaseCatalogClient,
): PublicCatalogRepository => ({
  getPublicCatalog: async () => {
    const catalog = PublicCatalogSnapshotSchema.parse(await client.getPublicCatalogSnapshot())
    const placeById = new Map(catalog.places.map((place) => [place.id, place]))
    const placeIdsWithMenus = new Set(catalog.menus.map((menu) => menu.placeId))
    const isPublic =
      catalog.places.every((place) => place.published && placeIdsWithMenus.has(place.id)) &&
      catalog.menus.every((menu) => {
        const parent = placeById.get(menu.placeId)
        return menu.published && menu.dataMode === catalog.dataMode && parent !== undefined
      })
    if (!isPublic) throw new PublicCatalogIntegrityError()
    return catalog
  },
})

export class PublicCatalogIntegrityError extends Error {
  readonly name = "PublicCatalogIntegrityError"

  constructor() {
    super("Supabase returned a catalog that violates the public read contract")
  }
}
