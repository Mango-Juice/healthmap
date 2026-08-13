import { z } from "zod"

export const HEALTH_TAGS = ["vegetables", "protein", "balanced", "plant_based"] as const
export const HealthTagSchema = z.enum(HEALTH_TAGS)
export const PlaceIdSchema = z.uuid().brand("PlaceId")
export const PlaceSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80)
  .brand("PlaceSlug")
export const MenuIdSchema = z.uuid().brand("MenuId")

export type HealthTag = z.infer<typeof HealthTagSchema>
export type PlaceId = z.infer<typeof PlaceIdSchema>
export type PlaceSlug = z.infer<typeof PlaceSlugSchema>
export type MenuId = z.infer<typeof MenuIdSchema>
