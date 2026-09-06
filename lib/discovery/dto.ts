import { z } from "zod"
import { MenuIdSchema, PlaceIdSchema, PlaceSlugSchema } from "../domain/contracts"
import { DiscoveryFactsSchema, DiscoveryMediaSchema } from "./facts"
import { ExactSubwayStoreUrlSchema } from "./subway-url"

export const DiscoveryMenuDtoSchema = z
  .strictObject({
    id: MenuIdSchema,
    placeId: PlaceIdSchema,
    name: z.string().min(1),
    facts: DiscoveryFactsSchema.unwrap().omit({ status: true }).readonly(),
    branchApplicability: z.enum(["branch_confirmed", "brand_common_unverified"]),
    applicabilityNotice: z.string().nullable(),
  })
  .readonly()
const DiscoveryPlaceDtoBaseShape = {
  id: PlaceIdSchema,
  slug: PlaceSlugSchema,
  name: z.string().min(1),
  brandId: z.string().min(1).nullable(),
  address: z.string().min(1),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  region: z.string().min(1),
  phone: z.string().nullable(),
  naverPlaceUrl: z.string().nullable(),
  media: z.array(DiscoveryMediaSchema).readonly(),
} as const
const MenuEvidencePlaceDtoSchema = z.strictObject({
  ...DiscoveryPlaceDtoBaseShape,
  listingKind: z.literal("menu_evidence"),
  storeDescription: z.null().default(null),
  officialStoreUrl: z.null().default(null),
})
const StoreOnlyPlaceDtoSchema = z.strictObject({
  ...DiscoveryPlaceDtoBaseShape,
  listingKind: z.literal("store_only"),
  storeDescription: z.string().min(1),
  officialStoreUrl: ExactSubwayStoreUrlSchema,
})
export const DiscoveryPlaceDtoSchema = z
  .preprocess(
    (value) =>
      typeof value === "object" && value !== null && !("listingKind" in value)
        ? { ...value, listingKind: "menu_evidence" }
        : value,
    z.discriminatedUnion("listingKind", [MenuEvidencePlaceDtoSchema, StoreOnlyPlaceDtoSchema]),
  )
  .readonly()
const PointSchema = z
  .strictObject({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .readonly()
export const DiscoveryRegionDtoSchema = z
  .strictObject({
    id: z.string(),
    label: z.string(),
    count: z.number().int().nonnegative(),
    bounds: z.strictObject({ southWest: PointSchema, northEast: PointSchema }).readonly(),
  })
  .readonly()
export const DiscoveryPlaceResultDtoSchema = z
  .strictObject({
    place: DiscoveryPlaceDtoSchema,
    menus: z.array(DiscoveryMenuDtoSchema).readonly(),
    matchingMenuIds: z.array(MenuIdSchema).readonly(),
  })
  .readonly()
export const DiscoveryRegionsResponseSchema = z
  .strictObject({
    catalogVersion: z.string(),
    total: z.number().int().nonnegative(),
    regions: z.array(DiscoveryRegionDtoSchema).readonly(),
  })
  .readonly()
export const DiscoveryPlacesResponseSchema = z
  .strictObject({
    catalogVersion: z.string(),
    sortBasis: z.enum(["map_center", "region_center", "catalog_center"]),
    sortOrigin: PointSchema.nullable(),
    total: z.number().int().nonnegative(),
    results: z.array(DiscoveryPlaceResultDtoSchema).max(100).readonly(),
    nextCursor: z.string().nullable(),
  })
  .readonly()
export const DiscoveryDetailResponseSchema = z
  .strictObject({
    catalogVersion: z.string(),
    place: DiscoveryPlaceDtoSchema,
    menus: z.array(DiscoveryMenuDtoSchema).readonly(),
  })
  .readonly()
export type DiscoveryMenuDto = z.infer<typeof DiscoveryMenuDtoSchema>
export type DiscoveryPlaceDto = z.infer<typeof DiscoveryPlaceDtoSchema>
export type DiscoveryPlaceResultDto = z.infer<typeof DiscoveryPlaceResultDtoSchema>
export type DiscoveryRegionDto = z.infer<typeof DiscoveryRegionDtoSchema>
export type DiscoveryRegionsResponse = z.infer<typeof DiscoveryRegionsResponseSchema>
export type DiscoveryPlacesResponse = z.infer<typeof DiscoveryPlacesResponseSchema>
export type DiscoveryDetailResponse = z.infer<typeof DiscoveryDetailResponseSchema>
