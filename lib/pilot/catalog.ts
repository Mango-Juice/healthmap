import { z } from "zod"
import { MenuIdSchema, PlaceIdSchema, PlaceSlugSchema } from "../domain/contracts"
import { ExactNaverPlaceUrlSchema } from "../domain/place-links"
import { PilotFactsSchema, PilotMediaSchema } from "./facts"

export const PilotSourceSchema = z.enum([
  "seoul_vegetarian",
  "seoul_wholegrain",
  "mois_good_price",
  "gangnam_model_restaurant",
  "salady",
  "slowcali",
  "pokeallday",
  "preppers",
  "bon_dosirak",
])
const CredentialQueryKeys = new Set(["accesstoken", "apikey", "token", "secret", "signature"])
const EvidenceUrlSchema = z
  .url({
    protocol: /^https$/,
    hostname:
      /^(?:fsi[.]seoul[.]go[.]kr|www[.]data[.]go[.]kr|(?:www[.])?salady[.]com|(?:www[.])?slowcali[.]co[.]kr|pokeallday[.]co[.]kr|prepperskorea[.]com|(?:api|www)[.]bonif[.]co[.]kr)$/,
  })
  .refine((value) => {
    const url = URL.parse(value)
    return (
      url !== null &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.hash === "" &&
      [...url.searchParams.keys()].every(
        (key) =>
          !CredentialQueryKeys.has(
            key
              .normalize("NFKC")
              .toLowerCase()
              .replaceAll(/[^a-z0-9]/gu, ""),
          ),
      )
    )
  })

export { PilotFactsSchema } from "./facts"
export const PilotPlaceSchema = z
  .strictObject({
    address: z.string().trim().min(1),
    id: PlaceIdSchema,
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    name: z.string().trim().min(1),
    brandId: z.string().min(1).nullable().default(null),
    brandVariant: z.string().min(1).nullable().default(null),
    phone: z.string().min(1).nullable().default(null),
    naverPlaceUrl: ExactNaverPlaceUrlSchema.nullable().default(null),
    media: z.array(PilotMediaSchema).readonly().default([]),
    reviewStatus: z.literal("candidate"),
    slug: PlaceSlugSchema,
    sources: z.array(PilotSourceSchema).min(1).readonly(),
  })
  .readonly()
export const PilotMenuSchema = z
  .strictObject({
    id: MenuIdSchema,
    placeId: PlaceIdSchema,
    name: z.string().trim().min(1),
    facts: PilotFactsSchema,
    branchApplicability: z.enum(["branch_confirmed", "brand_common_unverified"]),
    placeMatch: z.enum(["exact_match", "human_resolved"]).default("exact_match"),
    brandId: z.string().min(1).nullable().default(null),
    brandVariant: z.string().min(1).nullable().default(null),
    evidence: z
      .array(
        z
          .strictObject({
            source: PilotSourceSchema,
            sourceReviewStatus: z.enum(["reviewed", "pending_review"]).default("reviewed"),
            sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
            digestKind: z.enum(["raw_source", "structured_source"]).default("raw_source"),
            evidenceUrl: EvidenceUrlSchema,
            capturedAt: z.iso.datetime({ offset: true }),
            expiresAt: z.iso.datetime({ offset: true }),
            publishedAt: z.iso.datetime({ offset: true }).nullable().default(null),
            effectiveAt: z.iso.datetime({ offset: true }).nullable().default(null),
            rawText: z.string().min(1),
          })
          .readonly(),
      )
      .min(1)
      .readonly(),
  })
  .readonly()
export const PilotCatalogSchema = z
  .strictObject({
    schemaVersion: z.literal("pilot-menu-facts-2"),
    catalogVersion: z.string().regex(/^pilot-[0-9]{8}-[a-f0-9]{12}$/),
    asOf: z.iso.datetime({ offset: true }),
    menus: z.array(PilotMenuSchema).readonly(),
    places: z.array(PilotPlaceSchema).readonly(),
  })
  .readonly()
  .superRefine((catalog, context) => {
    const placeIds = new Set(catalog.places.map((place) => place.id))
    const menuIds = new Set(catalog.menus.map((menu) => menu.id))
    if (placeIds.size !== catalog.places.length || menuIds.size !== catalog.menus.length)
      context.addIssue({ code: "custom", message: "Pilot IDs must be unique" })
    const parentIds = new Set(catalog.menus.map((menu) => menu.placeId))
    if (catalog.menus.some((menu) => !placeIds.has(menu.placeId)))
      context.addIssue({ code: "custom", message: "Pilot menu parent is missing" })
    if (catalog.places.some((place) => !parentIds.has(place.id)))
      context.addIssue({ code: "custom", message: "Pilot place requires a menu" })
    const menuIdsByPlace = new Map<PilotPlace["id"], Set<PilotMenu["id"]>>()
    for (const menu of catalog.menus) {
      const menuIds = menuIdsByPlace.get(menu.placeId) ?? new Set<PilotMenu["id"]>()
      menuIds.add(menu.id)
      menuIdsByPlace.set(menu.placeId, menuIds)
    }
    if (
      catalog.places.some((place) =>
        place.media.some((media) =>
          media.menuIds.some((menuId) => !menuIdsByPlace.get(place.id)?.has(menuId)),
        ),
      )
    )
      context.addIssue({ code: "custom", message: "Pilot media menu belongs to another place" })
    const asOf = Date.parse(catalog.asOf)
    if (
      catalog.menus.some((menu) =>
        menu.evidence.some(
          (evidence) =>
            Date.parse(evidence.capturedAt) > asOf || Date.parse(evidence.expiresAt) <= asOf,
        ),
      )
    )
      context.addIssue({ code: "custom", message: "Pilot evidence is not current at asOf" })
  })
export type PilotCatalog = z.infer<typeof PilotCatalogSchema>
export type PilotPlace = z.infer<typeof PilotPlaceSchema>
export type PilotMenu = z.infer<typeof PilotMenuSchema>
export type PilotSource = z.infer<typeof PilotSourceSchema>

export const currentPilotCatalog = (catalog: PilotCatalog, now: number): PilotCatalog => {
  const menus = catalog.menus.filter((menu) =>
    menu.evidence.every(
      (evidence) => Date.parse(evidence.capturedAt) <= now && Date.parse(evidence.expiresAt) > now,
    ),
  )
  const ids = new Set(menus.map((menu) => menu.placeId))
  return { ...catalog, menus, places: catalog.places.filter((place) => ids.has(place.id)) }
}
