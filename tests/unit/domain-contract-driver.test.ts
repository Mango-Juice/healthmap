import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import { z } from "zod"

const DriverReportSchema = z
  .object({
    status: z.literal("PASS"),
    observations: z
      .object({
        nfkcTokenAndIds: z.array(z.string()).length(1),
        blankQueryIds: z.array(z.string()).length(3),
        longKoreanIds: z.array(z.string()).length(1),
        urlShapedIds: z.array(z.string()).length(1),
        canonicalShareQuery: z.literal("q=&tag=vegetables&lat=37.5&lng=127.0328&z=15"),
        malformedShare: z.null(),
        unknownShare: z.null(),
        outOfBoundsShare: z.null(),
        viewportPendingAfterMovement: z.literal(true),
        viewportAppliedAfterCommit: z.literal(true),
        stableDistanceTieIds: z.array(z.string()).length(2),
      })
      .strict(),
    assertions: z
      .object({
        nfkcLowercaseWhitespace: z.literal(true),
        blankQuery: z.literal(true),
        tokenAnd: z.literal(true),
        malformedRejected: z.literal(true),
        unknownRejected: z.literal(true),
        outOfBoundsRejected: z.literal(true),
        canonicalShareKeys: z.literal(true),
        longKorean: z.literal(true),
        urlShaped: z.literal(true),
        viewportCommit: z.literal(true),
        stableDistanceTie: z.literal(true),
      })
      .strict(),
  })
  .strict()

const runDomainDriver = (): unknown => {
  const output = execFileSync(
    process.execPath,
    ["--no-warnings", "--experimental-strip-types", "scripts/domain-contract-driver.ts"],
    { cwd: process.cwd(), encoding: "utf8" },
  )
  return JSON.parse(output)
}

describe("domain contract driver", () => {
  it("Given the verifier output, when encoded, then it contains no legacy map-share keys", () => {
    // Given
    const report = runDomainDriver()

    // When
    const encoded = JSON.stringify(report)

    // Then
    expect(encoded).not.toContain("place")
    expect(encoded).not.toContain("src")
    expect(encoded).not.toContain("latitude")
    expect(encoded).not.toContain("longitude")
  })

  it("Given the verifier output, when parsed, then every required discovery and map observable is present", () => {
    // Given
    const report = runDomainDriver()

    // When
    const parsed = DriverReportSchema.safeParse(report)

    // Then
    expect(parsed.success).toBe(true)
  })
})
