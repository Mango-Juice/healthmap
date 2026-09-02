import { z } from "zod"
import { HealthTagSchema, MenuIdSchema, PlaceIdSchema, PlaceSlugSchema } from "./contracts.ts"

const HealthTagsSchema = z.array(HealthTagSchema).min(1).readonly()
const hasNoUrlUserInfo = (value: string): boolean => {
  const url = URL.parse(value)
  return url !== null && url.username === "" && url.password === ""
}
const NaverPlaceUrlSchema = z
  .url({
    protocol: /^https$/,
    hostname: /^(?:map[.]naver[.]com|m[.]place[.]naver[.]com|place[.]naver[.]com|naver[.]me)$/,
  })
  .refine(hasNoUrlUserInfo, "URL userinfo is not allowed")
const ProductionEvidenceUrlSchema = z
  .url({ protocol: /^https$/ })
  .refine(
    (url) => URL.parse(url)?.hostname !== "example.invalid",
    "placeholder evidence is not allowed",
  )
  .refine(hasNoUrlUserInfo, "URL userinfo is not allowed")
const CatalogVersionSchema = z.string().trim().min(1).max(120)
export const VerificationMethodSchema = z.enum([
  "official_menu",
  "merchant_submission",
  "direct_confirmation",
  "government_exact",
])
const PlaceFields = {
  id: PlaceIdSchema,
  slug: PlaceSlugSchema,
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  latitude: z.number().min(37.492).max(37.5085),
  longitude: z.number().min(127.02).max(127.0445),
  primaryTag: HealthTagSchema,
  healthTags: HealthTagsSchema,
  published: z.boolean(),
} as const
const MenuFields = {
  id: MenuIdSchema,
  placeId: PlaceIdSchema,
  name: z.string().trim().min(1),
  healthTags: HealthTagsSchema,
  evidenceUrl: ProductionEvidenceUrlSchema.nullable(),
  verificationMethod: VerificationMethodSchema,
  verifiedAt: z.iso.date(),
  validUntil: z.iso.date(),
  displayOrder: z.number().int().nonnegative(),
  published: z.boolean(),
} as const

const enforcePrimaryTag = (
  place: { readonly primaryTag: string; readonly healthTags: readonly string[] },
  context: z.RefinementCtx,
): void => {
  if (!place.healthTags.includes(place.primaryTag))
    context.addIssue({
      code: "custom",
      message: "primaryTag must be included in healthTags",
      path: ["primaryTag"],
    })
}

export const ProductionPlaceSchema = z
  .object({
    ...PlaceFields,
    dataMode: z.literal("production"),
    naverPlaceUrl: NaverPlaceUrlSchema,
  })
  .strict()
  .readonly()
  .superRefine(enforcePrimaryTag)
export const PlaceSchema = ProductionPlaceSchema

export const ProductionMenuSchema = z
  .object({
    ...MenuFields,
    dataMode: z.literal("production"),
  })
  .strict()
  .readonly()
  .superRefine((menu, context) => {
    const requiresEvidence = menu.verificationMethod !== "direct_confirmation"
    if (requiresEvidence && menu.evidenceUrl === null)
      context.addIssue({
        code: "custom",
        message: "verification method requires an evidence URL",
        path: ["evidenceUrl"],
      })
    if (!requiresEvidence && menu.evidenceUrl !== null)
      context.addIssue({
        code: "custom",
        message: "direct confirmation forbids an evidence URL",
        path: ["evidenceUrl"],
      })
    if (menu.validUntil <= menu.verifiedAt)
      context.addIssue({
        code: "custom",
        message: "validUntil must be after verifiedAt",
        path: ["validUntil"],
      })
    const policyDays = menu.verificationMethod === "direct_confirmation" ? 90 : 180
    const validityDays =
      (Date.parse(`${menu.validUntil}T00:00:00Z`) - Date.parse(`${menu.verifiedAt}T00:00:00Z`)) /
      86_400_000
    if (validityDays > policyDays)
      context.addIssue({
        code: "custom",
        message: `validUntil exceeds the ${policyDays}-day verification policy`,
        path: ["validUntil"],
      })
  })
export const MenuSchema = ProductionMenuSchema

const RawPlaceFields = {
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  naver_place_url: z.string(),
  primary_tag: z.string(),
  health_tags: z.array(z.string()),
  published: z.boolean(),
} as const
const RawMenuFields = {
  id: z.string(),
  place_id: z.string(),
  name: z.string(),
  health_tags: z.array(z.string()),
  evidence_url: z.string().nullable(),
  verification_method: VerificationMethodSchema,
  verified_at: z.string(),
  valid_until: z.string(),
  display_order: z.number(),
  published: z.boolean(),
} as const
const ProductionPlaceRowSchema = z
  .object({ ...RawPlaceFields, data_mode: z.literal("production") })
  .strict()
const ProductionMenuRowSchema = z
  .object({ ...RawMenuFields, data_mode: z.literal("production") })
  .strict()
const PlaceRowSchema = ProductionPlaceRowSchema
const MenuRowSchema = ProductionMenuRowSchema

type RawPlace = z.infer<typeof PlaceRowSchema>
type RawMenu = z.infer<typeof MenuRowSchema>
const toPlace = (row: RawPlace): Place => {
  const fields = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    naverPlaceUrl: row.naver_place_url,
    primaryTag: row.primary_tag,
    healthTags: row.health_tags,
    published: row.published,
  }
  return ProductionPlaceSchema.parse({ ...fields, dataMode: row.data_mode })
}
const toMenu = (row: RawMenu): Menu => {
  const fields = {
    id: row.id,
    placeId: row.place_id,
    name: row.name,
    healthTags: row.health_tags,
    evidenceUrl: row.evidence_url,
    verificationMethod: row.verification_method,
    verifiedAt: row.verified_at,
    validUntil: row.valid_until,
    displayOrder: row.display_order,
    published: row.published,
  }
  return ProductionMenuSchema.parse({ ...fields, dataMode: row.data_mode })
}

export type Place = z.infer<typeof PlaceSchema>
export type Menu = z.infer<typeof MenuSchema>
export const PublicCatalogSnapshotSchema = z
  .object({
    catalogVersion: CatalogVersionSchema,
    dataMode: z.literal("production"),
    places: z.array(PlaceSchema).readonly(),
    menus: z.array(MenuSchema).readonly(),
  })
  .strict()
  .readonly()
export type PublicCatalogSnapshot = z.infer<typeof PublicCatalogSnapshotSchema>
export const parsePlaceRows = (rows: readonly unknown[]): readonly Place[] =>
  z.array(PlaceRowSchema).readonly().parse(rows).map(toPlace)
export const parseMenuRows = (rows: readonly unknown[]): readonly Menu[] =>
  z.array(MenuRowSchema).readonly().parse(rows).map(toMenu)
