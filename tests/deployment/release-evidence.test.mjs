import assert from "node:assert/strict"
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { validateReleaseEvidence } from "../../scripts/deploy/validate-release-evidence.mjs"

const validEvidence = {
  environment: "production",
  origin: "https://healthmap.example.com",
  deploymentId: "dpl_release_123",
  rollbackDeploymentId: "dpl_previous_122",
  migrationVersion: "20260822130000",
  schemaVersion: "1.0.0",
  catalogVersion: "catalog-20260822",
  manifestHash: "a".repeat(64),
  placeCount: 100,
  menuCount: 100,
  approvalCount: 100,
  recheckCount: 20,
  providers: { supabase: "verified", naver: "verified", posthog: "verified" },
  smokePassed: true,
  e2ePassed: true,
  capturedAt: "2026-08-22T00:00:00.000Z",
}

const withTemporaryReleaseEvidenceDirectory = async (action) => {
  const directory = await mkdtemp(join(tmpdir(), "healthmap-release-evidence-"))
  try {
    return await action(directory)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

test("release evidence accepts an exact current production proof", () => {
  assert.deepEqual(validateReleaseEvidence(validEvidence, "2026-08-22T12:00:00.000Z"), [])
})

test("release evidence rejects stale, partial, unknown, and secret-shaped proofs", () => {
  const failures = validateReleaseEvidence(
    {
      ...validEvidence,
      placeCount: 99,
      approvalCount: 98,
      capturedAt: "2026-08-19T00:00:00.000Z",
      serviceRole: "must-not-appear",
    },
    "2026-08-22T12:00:00.000Z",
  )
  assert.deepEqual(failures.sort(), ["contract", "freshness", "secret", "unknown-fields"])
})

test("release evidence rejects timestamps more than the clock-skew allowance in the future", () => {
  assert.deepEqual(
    validateReleaseEvidence(
      { ...validEvidence, capturedAt: "2026-08-24T12:00:00.000Z" },
      "2026-08-22T12:00:00.000Z",
    ),
    ["freshness"],
  )
})

test("release evidence accepts timestamps at the five-minute future clock-skew boundary", () => {
  assert.deepEqual(
    validateReleaseEvidence(
      { ...validEvidence, capturedAt: "2026-08-22T12:05:00.000Z" },
      "2026-08-22T12:00:00.000Z",
    ),
    [],
  )
})

test("release evidence temporary workspaces are removed after completed and rejected work", async () => {
  let completedDirectory = ""
  await withTemporaryReleaseEvidenceDirectory(async (directory) => {
    completedDirectory = directory
    await writeFile(join(directory, "evidence.json"), JSON.stringify(validEvidence))
  })
  await assert.rejects(lstat(completedDirectory), { code: "ENOENT" })

  let rejectedDirectory = ""
  await assert.rejects(
    withTemporaryReleaseEvidenceDirectory(async (directory) => {
      rejectedDirectory = directory
      await writeFile(join(directory, "evidence.json"), JSON.stringify(validEvidence))
      throw new TypeError("simulated cancellation")
    }),
    /simulated cancellation/,
  )
  await assert.rejects(lstat(rejectedDirectory), { code: "ENOENT" })
})

test("release evidence CLI reports only categories and never values", async () => {
  await withTemporaryReleaseEvidenceDirectory(async (directory) => {
    const path = join(directory, "evidence.json")
    await writeFile(path, JSON.stringify({ ...validEvidence, origin: "https://secret.invalid" }))
    const failures = validateReleaseEvidence(
      JSON.parse(await readFile(path, "utf8")),
      "2026-08-22T12:00:00.000Z",
    )
    assert.ok(failures.includes("origin"))
    assert.doesNotMatch(failures.join(" "), /secret\.invalid/)
  })
})
