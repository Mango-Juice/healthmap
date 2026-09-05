import { z } from "zod"
import { MenuIdSchema, PlaceIdSchema, PlaceSlugSchema } from "../domain/contracts"
import { PilotFactsSchema, PilotMediaSchema } from "./facts"

export const PilotMenuDtoSchema = z
  .strictObject({
    id: MenuIdSchema,
    placeId: PlaceIdSchema,
    name: z.string().min(1),
    facts: PilotFactsSchema.unwrap().omit({ status: true }).readonly(),
    branchApplicability: z.enum(["branch_confirmed", "brand_common_unverified"]),
    applicabilityNotice: z.string().nullable(),
  })
  .readonly()
export const PilotPlaceDtoSchema = z
  .strictObject({
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
    media: z.array(PilotMediaSchema).readonly(),
  })
  .readonly()
const PointSchema = z
  .strictObject({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .readonly()
export const PilotRegionDtoSchema = z
  .strictObject({
    id: z.string(),
    label: z.string(),
    count: z.number().int().nonnegative(),
    bounds: z.strictObject({ southWest: PointSchema, northEast: PointSchema }).readonly(),
  })
  .readonly()
export const PilotPlaceResultDtoSchema = z
  .strictObject({
    place: PilotPlaceDtoSchema,
    menus: z.array(PilotMenuDtoSchema).readonly(),
    matchingMenuIds: z.array(MenuIdSchema).readonly(),
  })
  .readonly()
export const PilotRegionsResponseSchema = z
  .strictObject({
    catalogVersion: z.string(),
    total: z.number().int().nonnegative(),
    regions: z.array(PilotRegionDtoSchema).readonly(),
  })
  .readonly()
export const PilotPlacesResponseSchema = z
  .strictObject({
    catalogVersion: z.string(),
    sortBasis: z.enum(["map_center", "region_center", "catalog_center"]),
    sortOrigin: PointSchema.nullable(),
    total: z.number().int().nonnegative(),
    results: z.array(PilotPlaceResultDtoSchema).max(100).readonly(),
    nextCursor: z.string().nullable(),
  })
  .readonly()
export const PilotDetailResponseSchema = z
  .strictObject({
    catalogVersion: z.string(),
    place: PilotPlaceDtoSchema,
    menus: z.array(PilotMenuDtoSchema).readonly(),
  })
  .readonly()
export type PilotMenuDto = z.infer<typeof PilotMenuDtoSchema>
export type PilotPlaceDto = z.infer<typeof PilotPlaceDtoSchema>
export type PilotPlaceResultDto = z.infer<typeof PilotPlaceResultDtoSchema>
export type PilotRegionDto = z.infer<typeof PilotRegionDtoSchema>
export type PilotRegionsResponse = z.infer<typeof PilotRegionsResponseSchema>
export type PilotPlacesResponse = z.infer<typeof PilotPlacesResponseSchema>
export type PilotDetailResponse = z.infer<typeof PilotDetailResponseSchema>
