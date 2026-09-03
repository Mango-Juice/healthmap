import { z } from "zod"
import { HealthTagSchema, MenuIdSchema, PlaceIdSchema, PlaceSlugSchema } from "../domain/contracts"

export const PilotSourceSchema = z.enum(["seoul_vegetarian", "seoul_wholegrain", "mois_good_price"])
export const PilotMatchLevelSchema = z.enum([
  "exact_name_and_address",
  "name_and_address_review",
  "address_review",
  "nearby_review",
])
const PilotEvidenceUrlSchema = z
  .url({ protocol: /^https$/, hostname: /^(?:fsi[.]seoul[.]go[.]kr|www[.]data[.]go[.]kr)$/ })
  .refine((value) => {
    const url = URL.parse(value)
    return url !== null && url.username === "" && url.password === ""
  }, "URL userinfo is not allowed")
const HealthTagsSchema = z.array(HealthTagSchema).readonly()
const PilotOfficialImageUrlSchema = z.url({
  protocol: /^https$/,
  hostname: /^(?:www[.])?slowcali[.]co[.]kr$/,
})

export const PilotOfficialImageSchema = z
  .strictObject({
    alt: z.string().trim().min(1),
    height: z.number().int().positive(),
    providerUrl: PilotOfficialImageUrlSchema,
    url: PilotOfficialImageUrlSchema,
    width: z.number().int().positive(),
  })
  .readonly()

export const PilotPlaceSchema = z
  .strictObject({
    address: z.string().trim().min(1),
    healthTags: HealthTagsSchema,
    id: PlaceIdSchema,
    latitude: z.number().min(37.492).max(37.5085),
    longitude: z.number().min(127.02).max(127.0445),
    matchLevel: PilotMatchLevelSchema,
    name: z.string().trim().min(1),
    officialImage: PilotOfficialImageSchema.optional(),
    reviewStatus: z.literal("candidate"),
    slug: PlaceSlugSchema,
    sources: z.array(PilotSourceSchema).min(1).readonly(),
  })
  .readonly()

export const PilotMenuSchema = z
  .strictObject({
    evidenceUrl: PilotEvidenceUrlSchema,
    healthTags: HealthTagsSchema,
    id: MenuIdSchema,
    name: z.string().trim().min(1),
    placeId: PlaceIdSchema,
    priceKrw: z.number().int().positive().nullable(),
    source: PilotSourceSchema,
    verifiedAt: z.iso.date(),
  })
  .readonly()

export const PilotCatalogSchema = z
  .strictObject({
    catalogVersion: z.string().regex(/^pilot-[0-9]{8}$/),
    menus: z.array(PilotMenuSchema).readonly(),
    places: z.array(PilotPlaceSchema).readonly(),
  })
  .readonly()
  .superRefine((catalog, context) => {
    const placeIds = new Set(catalog.places.map((place) => place.id))
    if (placeIds.size !== catalog.places.length)
      context.addIssue({
        code: "custom",
        message: "pilot place IDs must be unique",
        path: ["places"],
      })
    const menuPlaceIds = new Set(catalog.menus.map((menu) => menu.placeId))
    if (catalog.menus.some((menu) => !placeIds.has(menu.placeId)))
      context.addIssue({ code: "custom", message: "pilot menu parent is missing", path: ["menus"] })
    if (catalog.places.some((place) => !menuPlaceIds.has(place.id)))
      context.addIssue({ code: "custom", message: "pilot place requires a menu", path: ["places"] })
  })

export type PilotCatalog = z.infer<typeof PilotCatalogSchema>
export type PilotPlace = z.infer<typeof PilotPlaceSchema>
export type PilotMenu = z.infer<typeof PilotMenuSchema>
export type PilotSource = z.infer<typeof PilotSourceSchema>
export type PilotMatchLevel = z.infer<typeof PilotMatchLevelSchema>
export type PilotOfficialImage = z.infer<typeof PilotOfficialImageSchema>
