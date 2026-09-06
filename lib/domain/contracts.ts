import { z } from "zod"

export const PlaceIdSchema = z.uuid().brand("PlaceId")
export const PlaceSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80)
  .brand("PlaceSlug")
export const MenuIdSchema = z.uuid().brand("MenuId")

export type PlaceId = z.infer<typeof PlaceIdSchema>
export type PlaceSlug = z.infer<typeof PlaceSlugSchema>
export type MenuId = z.infer<typeof MenuIdSchema>
