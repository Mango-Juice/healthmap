import { createHash } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { type Suggestion, type SuggestionResult, SuggestionSchema } from "./contracts.ts"

const RowSchema = z
  .object({
    submission: SuggestionSchema,
    actor: z.string(),
    fingerprint: z.string(),
    receivedAt: z.number(),
    status: z.literal("pending"),
  })
  .strict()
const RowsSchema = z.array(RowSchema).max(1000)

export const suggestionFingerprint = (submission: Suggestion): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        submission.kind,
        submission.placeUrl,
        submission.text,
        submission.evidenceUrl,
      ]),
    )
    .digest("hex")

export const saveLocalSuggestion = async (
  directory: string,
  submission: Suggestion,
  actor: string,
): Promise<SuggestionResult> => {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const lock = join(directory, "lock")
  await mkdir(lock)
  try {
    const file = join(directory, "pending.json")
    let rows: z.infer<typeof RowsSchema> = []
    try {
      rows = RowsSchema.parse(JSON.parse(await readFile(file, "utf8")))
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error
    }
    const fingerprint = suggestionFingerprint(submission)
    const replay = rows.find((row) => row.submission.requestId === submission.requestId)
    if (replay)
      return replay.actor === actor && replay.fingerprint === fingerprint ? "duplicate" : "conflict"
    const recent = rows.filter(
      (row) => row.actor === actor && row.receivedAt > Date.now() - 86_400_000,
    )
    if (recent.some((row) => row.fingerprint === fingerprint)) return "duplicate"
    if (recent.length >= 5 || rows.length >= 1000) return "limited"
    rows.push({ submission, actor, fingerprint, receivedAt: Date.now(), status: "pending" })
    await writeFile(join(directory, "pending.tmp"), JSON.stringify(rows, null, 2), { mode: 0o600 })
    await rename(join(directory, "pending.tmp"), file)
    return "queued"
  } finally {
    await rm(lock, { recursive: true })
  }
}
