import { z } from "zod"
import {
  enforceMenuVerification,
  ProductionMenuObjectSchema,
  ProductionPlaceSchema,
} from "./catalog-v1.ts"
import { MenuFactsObjectSchema, PublicMediaSchema } from "./menu-facts.ts"
import { matchesPublicNaverSearchTarget, PublicNaverUrlSchema } from "./public-place-links.ts"

export const BrandFields = {
  brandId: z.string().trim().min(1).nullable(),
  brandVariant: z.string().trim().min(1).nullable(),
} as const
export const ProductionPlaceV2Schema = ProductionPlaceSchema.unwrap()
  .omit({ primaryTag: true, healthTags: true, schemaVersion: true })
  .extend({
    schemaVersion: z.literal("2.0.0"),
    ...BrandFields,
    phone: z.string().trim().min(1).nullable(),
    media: z.array(PublicMediaSchema).readonly(),
    naverPlaceUrl: PublicNaverUrlSchema,
  })
  .strict()
  .readonly()
  .superRefine((place, context) => {
    if (!matchesPublicNaverSearchTarget(place.naverPlaceUrl, place))
      context.addIssue({
        code: "custom",
        path: ["naverPlaceUrl"],
        message: "Search URL must match name and address",
      })
  })
export const ProductionMenuV2Schema = ProductionMenuObjectSchema.omit({
  healthTags: true,
  schemaVersion: true,
})
  .extend({
    schemaVersion: z.literal("2.0.0"),
    ...BrandFields,
    facts: MenuFactsObjectSchema.extend({
      selection_reasons: MenuFactsObjectSchema.shape.selection_reasons.unwrap().min(1).readonly(),
    }).readonly(),
    branchApplicability: z.enum(["branch_confirmed", "brand_common_unverified"]),
  })
  .strict()
  .readonly()
  .superRefine(enforceMenuVerification)
  .superRefine((menu, context) => {
    if (menu.branchApplicability === "brand_common_unverified" && menu.brandId === null)
      context.addIssue({
        code: "custom",
        path: ["brandId"],
        message: "Brand common menus require brandId",
      })
  })

const PlaceRowSchema = z
  .strictObject({
    schema_version: z.literal("2.0.0"),
    id: z.unknown(),
    slug: z.unknown(),
    name: z.unknown(),
    address: z.unknown(),
    latitude: z.unknown(),
    longitude: z.unknown(),
    naver_place_url: z.unknown(),
    published: z.unknown(),
    data_mode: z.unknown(),
    phone: z.unknown(),
    brand_id: z.unknown(),
    brand_variant: z.unknown(),
    media: z.unknown(),
  })
  .transform((row) =>
    ProductionPlaceV2Schema.parse({
      schemaVersion: row.schema_version,
      id: row.id,
      slug: row.slug,
      name: row.name,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      naverPlaceUrl: row.naver_place_url,
      published: row.published,
      dataMode: row.data_mode,
      phone: row.phone,
      brandId: row.brand_id,
      brandVariant: row.brand_variant,
      media: row.media,
    }),
  )
const MenuRowSchema = z
  .strictObject({
    schema_version: z.literal("2.0.0"),
    id: z.unknown(),
    place_id: z.unknown(),
    name: z.unknown(),
    evidence_url: z.unknown(),
    verification_method: z.unknown(),
    verified_at: z.unknown(),
    valid_until: z.unknown(),
    display_order: z.unknown(),
    published: z.unknown(),
    data_mode: z.unknown(),
    brand_id: z.unknown(),
    brand_variant: z.unknown(),
    branch_applicability: z.unknown(),
    facts: z.unknown(),
  })
  .transform((row) =>
    ProductionMenuV2Schema.parse({
      schemaVersion: row.schema_version,
      id: row.id,
      placeId: row.place_id,
      name: row.name,
      evidenceUrl: row.evidence_url,
      verificationMethod: row.verification_method,
      verifiedAt: row.verified_at,
      validUntil: row.valid_until,
      displayOrder: row.display_order,
      published: row.published,
      dataMode: row.data_mode,
      brandId: row.brand_id,
      brandVariant: row.brand_variant,
      branchApplicability: row.branch_applicability,
      facts: row.facts,
    }),
  )
export const parseV2PlaceRow = (row: unknown) => PlaceRowSchema.parse(row)
export const parseV2MenuRow = (row: unknown) => MenuRowSchema.parse(row)
