import { z } from "zod"
import { MenuFactsObjectSchema, PublicMediaSchema } from "../domain/menu-facts"

export const PilotFactsSchema = MenuFactsObjectSchema.extend({
  status: z.literal("candidate"),
}).readonly()
export const PilotMediaSchema = PublicMediaSchema
