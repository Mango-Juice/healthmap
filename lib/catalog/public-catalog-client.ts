import { z } from "zod"
import { type Menu, MenuSchema, type Place, PlaceSchema } from "../domain/catalog.ts"
import { requestJson } from "../http/request.ts"

export type ClientPublicCatalog = {
  readonly dataMode: "mock" | "production"
  readonly menus: readonly Menu[]
  readonly places: readonly Place[]
}

const PublicCatalogResponseSchema = z
  .object({
    dataMode: z.enum(["mock", "production"]),
    menus: z.array(MenuSchema).readonly(),
    places: z.array(PlaceSchema).readonly(),
  })
  .strict()
  .superRefine((catalog, context) => {
    if (catalog.places.some((place) => place.dataMode !== catalog.dataMode))
      context.addIssue({
        code: "custom",
        message: "places must share catalog mode",
        path: ["places"],
      })
    if (catalog.menus.some((menu) => menu.dataMode !== catalog.dataMode))
      context.addIssue({
        code: "custom",
        message: "menus must share catalog mode",
        path: ["menus"],
      })
  })

export const loadPublicCatalog = (): Promise<ClientPublicCatalog> =>
  requestJson("/api/map-catalog", PublicCatalogResponseSchema)
