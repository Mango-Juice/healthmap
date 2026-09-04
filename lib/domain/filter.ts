import { z } from "zod"
import type { Place } from "./catalog.ts"

export const PLACE_FILTERS = [
  "all",
  "salad_poke",
  "rice",
  "whole_grain",
  "noodles",
  "soup",
  "sandwich",
  "main_dish",
  "plant_based",
  "vegetables",
  "protein",
  "balanced",
] as const
export const PlaceFilterSchema = z.enum(PLACE_FILTERS)
export const IngredientFilterSchema = z.enum(["all", "chicken", "fish", "tofu_soy"])
export const CookingFilterSchema = z.enum(["all", "grilled", "steamed", "roasted"])
export type PlaceFilter = z.infer<typeof PlaceFilterSchema>
export type IngredientFilter = z.infer<typeof IngredientFilterSchema>
export type CookingFilter = z.infer<typeof CookingFilterSchema>

export const filterPlaces = (places: readonly Place[], filter: PlaceFilter): readonly Place[] =>
  filter === "all"
    ? places
    : places.filter((place) =>
        place.schemaVersion === "2.0.0" ? false : place.healthTags.some((tag) => tag === filter),
      )
