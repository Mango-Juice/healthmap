import { z } from "zod"
import { ApprovedMediaSourceUrlSchema, ApprovedMediaUrlSchema } from "./place-links.ts"

export const MenuFactsObjectSchema = z.strictObject({
  scope: z.enum(["meal", "snack", "dessert", "drink", "unknown"]),
  form: z.enum(["salad_poke", "rice", "noodles", "soup", "sandwich", "main_dish", "unknown"]),
  ingredients: z.array(z.enum(["chicken", "fish", "tofu_soy"])).readonly(),
  rice_base: z.enum(["brown_rice", "mixed_grain", "barley", "unknown"]),
  base_is_option: z.boolean(),
  dietary: z.enum(["source_vegan_label", "vegan_option", "unknown"]),
  ordering_note: z.string().min(1).nullable(),
  cooking: z.array(z.enum(["grilled", "steamed", "roasted"])).readonly(),
  selection_reasons: z
    .array(
      z
        .strictObject({
          kind: z.enum(["salad_poke", "whole_grain", "dietary_meal", "ingredient_cooking"]),
          basis: z.enum(["menu_name", "description"]),
          text: z.string().trim().min(1),
        })
        .readonly(),
    )
    .readonly(),
})
export const MenuFactsSchema = MenuFactsObjectSchema.readonly()
export type MenuFacts = z.infer<typeof MenuFactsSchema>
export const PublicMediaSchema = z
  .strictObject({
    url: ApprovedMediaUrlSchema,
    alt: z.string().min(1),
    sourceUrl: ApprovedMediaSourceUrlSchema,
    scope: z.enum(["place", "brand"]),
    usageApproved: z.literal(true),
  })
  .readonly()
