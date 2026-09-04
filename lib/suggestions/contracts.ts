import { z } from "zod"

export const SuggestionUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    const url = new URL(value)
    return url.protocol === "https:" && url.username === "" && url.password === ""
  }, "HTTPS 주소를 입력해 주세요.")
  .transform((value) => {
    const url = new URL(value)
    url.hash = ""
    return url.toString()
  })

export const SuggestionSchema = z
  .object({
    requestId: z.uuid(),
    kind: z.enum(["place_add", "menu_correction"]),
    placeUrl: SuggestionUrlSchema,
    text: z.string().trim().min(10).max(2000),
    evidenceUrl: SuggestionUrlSchema,
  })
  .strict()
  .readonly()
export type Suggestion = z.infer<typeof SuggestionSchema>
export const SuggestionResultSchema = z.enum(["queued", "duplicate", "limited", "conflict"])
export type SuggestionResult = z.infer<typeof SuggestionResultSchema>
