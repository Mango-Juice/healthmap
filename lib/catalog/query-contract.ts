import { z } from "zod"
import { MenuSchema, PlaceSchema } from "../domain/catalog.ts"
import { CookingFilterSchema, IngredientFilterSchema, PlaceFilterSchema } from "../domain/filter.ts"

const coordinate = (min: number, max: number) => z.coerce.number().finite().min(min).max(max)
export const PublicCatalogQuerySchema = z
  .strictObject({
    mode: z.enum(["places", "regions"]).default("places"),
    query: z.string().trim().max(200).default(""),
    filter: PlaceFilterSchema.default("all"),
    ingredient: IngredientFilterSchema.default("all"),
    cooking: CookingFilterSchema.default("all"),
    region: z.string().trim().min(1).max(80).optional(),
    south: coordinate(-90, 90).optional(),
    north: coordinate(-90, 90).optional(),
    west: coordinate(-180, 180).optional(),
    east: coordinate(-180, 180).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(50),
    cursor: z.string().min(1).max(1000).optional(),
  })
  .superRefine((query, context) => {
    const bounds = [query.south, query.north, query.west, query.east]
    if (bounds.some((value) => value !== undefined) && bounds.some((value) => value === undefined))
      context.addIssue({ code: "custom", message: "All bounds are required" })
    if (
      (query.south !== undefined && query.north !== undefined && query.south > query.north) ||
      (query.west !== undefined && query.east !== undefined && query.west > query.east)
    )
      context.addIssue({ code: "custom", message: "Bounds must be ordered" })
    if (query.mode === "regions" && query.cursor !== undefined)
      context.addIssue({ code: "custom", message: "Regions do not paginate" })
  })
export type PublicCatalogQuery = z.infer<typeof PublicCatalogQuerySchema>
export const parsePublicCatalogQuery = (params: URLSearchParams) => {
  const entries = Array.from(params.entries())
  if (
    new Set(entries.map(([key]) => key)).size !== entries.length ||
    entries.some(([, value]) => value === "")
  )
    return PublicCatalogQuerySchema.safeParse({ invalid: true })
  return PublicCatalogQuerySchema.safeParse(Object.fromEntries(entries))
}
const PointSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})
export const PublicRegionSchema = z
  .strictObject({
    id: z.string(),
    label: z.string(),
    count: z.number().int().nonnegative(),
    bounds: z.strictObject({ southWest: PointSchema, northEast: PointSchema }),
  })
  .readonly()
export type PublicRegion = z.infer<typeof PublicRegionSchema>
export const PublicCatalogQueryResponseSchema = z
  .strictObject({
    catalogVersion: z.string().min(1),
    dataMode: z.literal("production"),
    places: z.array(PlaceSchema).max(50).readonly(),
    menus: z.array(MenuSchema).readonly(),
    total: z.number().int().nonnegative(),
    nextCursor: z.string().nullable(),
    regions: z.array(PublicRegionSchema).readonly(),
    facets: z
      .array(z.strictObject({ filter: PlaceFilterSchema, count: z.number().int().nonnegative() }))
      .readonly(),
  })
  .readonly()
export type PublicCatalogQueryResponse = z.infer<typeof PublicCatalogQueryResponseSchema>
export const PublicPlaceDetailResponseSchema = z
  .strictObject({
    catalogVersion: z.string().min(1),
    dataMode: z.literal("production"),
    place: PlaceSchema,
    menus: z.array(MenuSchema).readonly(),
  })
  .readonly()
