import { createHmac } from "node:crypto"
import { join } from "node:path"
import { requestJson } from "../http/request.ts"
import { isPilotEnabled } from "../pilot/environment.ts"
import { type Suggestion, SuggestionResultSchema } from "./contracts.ts"
import { saveLocalSuggestion, suggestionFingerprint } from "./local-store.ts"

export const isLocalSuggestionPilot = (url: URL): boolean =>
  url.searchParams.get("scope") === "pilot" &&
  isPilotEnabled(process.env) &&
  process.env["NODE_ENV"] === "development" &&
  !process.env["VERCEL"] &&
  ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)

export const submitSuggestion = async (request: Request, submission: Suggestion) => {
  const local = isLocalSuggestionPilot(new URL(request.url))
  if (new URL(request.url).searchParams.get("scope") === "pilot" && !isPilotEnabled(process.env))
    return null
  const secret = process.env["HEALTHMAP_SUGGESTION_HASH_SECRET"]
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]
  const key = process.env["HEALTHMAP_SUGGESTION_SERVICE_KEY"]
  if (!local && (!secret || secret.length < 32 || !url || !key)) return null
  // Vercel overwrites this header. Other deployments share a conservative bucket.
  const identity =
    process.env["VERCEL"] === "1"
      ? (request.headers.get("x-vercel-forwarded-for") ?? "unknown")
      : "local-requestor"
  const actor = createHmac("sha256", secret ?? "local-pilot-only")
    .update(`${new Date().toISOString().slice(0, 10)}:${identity}`)
    .digest("hex")
  if (local)
    return saveLocalSuggestion(join(process.cwd(), ".omo", "local-suggestions"), submission, actor)
  if (!url || !key) return null
  const endpoint = new URL("/rest/v1/rpc/submit_pending_suggestion", url)
  if (endpoint.protocol !== "https:") return null
  return requestJson(endpoint.toString(), SuggestionResultSchema, {
    method: "POST",
    headers: {
      apikey: key,
      ...(key.startsWith("sb_secret_") ? {} : { authorization: `Bearer ${key}` }),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_submission: submission,
      p_actor: actor,
      p_fingerprint: suggestionFingerprint(submission),
    }),
  })
}
