import { z } from "zod"
import { type Menu, MenuSchema, type Place, PlaceSchema } from "../domain/catalog.ts"
import { requestJson } from "../http/request.ts"

export type ClientPublicCatalog = {
  readonly dataMode: "production"
  readonly menus: readonly Menu[]
  readonly places: readonly Place[]
}

const PublicCatalogResponseSchema = z
  .object({
    dataMode: z.literal("production"),
    menus: z.array(MenuSchema).readonly(),
    places: z.array(PlaceSchema).readonly(),
  })
  .strict()

export const loadPublicCatalog = (): Promise<ClientPublicCatalog> =>
  requestJson("/api/map-catalog", PublicCatalogResponseSchema)
