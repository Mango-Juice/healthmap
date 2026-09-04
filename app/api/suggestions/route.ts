import { SuggestionSchema } from "../../../lib/suggestions/contracts"
import { hasSameSuggestionOrigin } from "../../../lib/suggestions/origin"
import { submitSuggestion } from "../../../lib/suggestions/server"

export const runtime = "nodejs"

const reply = (status: number, state: string) =>
  Response.json(
    { state },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  )

export async function POST(request: Request) {
  if (!hasSameSuggestionOrigin(request)) return reply(403, "forbidden")
  if (request.headers.get("content-type") !== "application/json") return reply(415, "invalid")
  const reader = request.body?.getReader()
  if (!reader) return reply(400, "invalid")
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 16_384) {
        await reader.cancel()
        return reply(413, "invalid")
      }
      chunks.push(chunk.value)
    }
    const parsed = SuggestionSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")))
    if (!parsed.success) return reply(400, "invalid")
    const result = await submitSuggestion(request, parsed.data)
    if (result === null) return reply(503, "unavailable")
    return reply(result === "limited" ? 429 : result === "conflict" ? 409 : 200, result)
  } catch (error) {
    if (error instanceof SyntaxError) return reply(400, "invalid")
    return reply(503, "unavailable")
  } finally {
    reader.releaseLock()
  }
}
