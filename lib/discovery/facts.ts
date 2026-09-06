import { z } from "zod"
import { MenuIdSchema } from "../domain/contracts"
import { MenuFactsObjectSchema, PublicMediaSchema } from "../domain/menu-facts"

export const DiscoveryFactsSchema = MenuFactsObjectSchema.extend({
  status: z.literal("candidate"),
}).readonly()
export const DiscoveryMediaSchema = PublicMediaSchema.unwrap()
  .extend({
    subject: z.enum(["menu", "venue"]),
    menuIds: z.array(MenuIdSchema).readonly(),
    attribution: z.string().trim().min(1),
  })
  .readonly()
  .superRefine((media, context) => {
    const associationsAreValid =
      media.subject === "menu"
        ? media.menuIds.length > 0
        : media.scope === "place" && media.menuIds.length === 0
    if (!associationsAreValid || new Set(media.menuIds).size !== media.menuIds.length)
      context.addIssue({ code: "custom", message: "Discovery media association is inconsistent" })
  })
