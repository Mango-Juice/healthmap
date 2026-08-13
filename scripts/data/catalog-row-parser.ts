import { z } from "zod"

export const HEALTH_TAGS = ["vegetables", "protein", "balanced", "plant_based"] as const

const HealthTagSchema = z.enum(HEALTH_TAGS)
const PlaceIdSchema = z.uuid().brand("PlaceId")
const PlaceSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80)
  .brand("PlaceSlug")
const MenuIdSchema = z.uuid().brand("MenuId")
const HealthTagsSchema = z.array(HealthTagSchema).min(1).readonly()
const HttpsUrlSchema = z.url({ protocol: /^https$/ })
const NaverPlaceUrlSchema = z.url({
  protocol: /^https$/,
  hostname: /^(?:map[.]naver[.]com|m[.]place[.]naver[.]com|place[.]naver[.]com|naver[.]me)$/,
})

const PlaceSchema = z
  .object({
    id: PlaceIdSchema,
    slug: PlaceSlugSchema,
    name: z.string().trim().min(1),
    address: z.string().trim().min(1),
    latitude: z.number().min(37.492).max(37.5085),
    longitude: z.number().min(127.02).max(127.0445),
    naverPlaceUrl: NaverPlaceUrlSchema,
    primaryTag: HealthTagSchema,
    healthTags: HealthTagsSchema,
    published: z.boolean(),
  })
  .strict()
  .readonly()
  .superRefine((place, context) => {
    if (!place.healthTags.includes(place.primaryTag)) {
      context.addIssue({
        code: "custom",
        message: "primaryTag must be included in healthTags",
        path: ["primaryTag"],
      })
    }
  })

const MenuSchema = z
  .object({
    id: MenuIdSchema,
    placeId: PlaceIdSchema,
    name: z.string().trim().min(1),
    healthTags: HealthTagsSchema,
    evidenceUrl: HttpsUrlSchema,
    verifiedAt: z.iso.date(),
    displayOrder: z.number().int().nonnegative(),
    published: z.boolean(),
  })
  .strict()
  .readonly()

const PlaceRowSchema = z
  .object({
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
  })
  .strict()
  .transform((row) =>
    PlaceSchema.parse({
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
    }),
  )

const MenuRowSchema = z
  .object({
    id: z.string(),
    place_id: z.string(),
    name: z.string(),
    health_tags: z.array(z.string()),
    evidence_url: z.string(),
    verified_at: z.string(),
    display_order: z.number(),
    published: z.boolean(),
  })
  .strict()
  .transform((row) =>
    MenuSchema.parse({
      id: row.id,
      placeId: row.place_id,
      name: row.name,
      healthTags: row.health_tags,
      evidenceUrl: row.evidence_url,
      verifiedAt: row.verified_at,
      displayOrder: row.display_order,
      published: row.published,
    }),
  )

export type HealthTag = z.infer<typeof HealthTagSchema>
export type PlaceId = z.infer<typeof PlaceIdSchema>
export type PlaceSlug = z.infer<typeof PlaceSlugSchema>
export type MenuId = z.infer<typeof MenuIdSchema>
export type Place = z.infer<typeof PlaceSchema>
export type Menu = z.infer<typeof MenuSchema>

export const parsePlaceRows = (rows: readonly unknown[]): readonly Place[] =>
  z.array(PlaceRowSchema).readonly().parse(rows)

export const parseMenuRows = (rows: readonly unknown[]): readonly Menu[] =>
  z.array(MenuRowSchema).readonly().parse(rows)
