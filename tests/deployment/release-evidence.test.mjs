import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { lstat, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import {
  CURRENT_RELEASE_EVIDENCE_CONTRACT,
  validateReleaseEvidence,
} from "../../scripts/deploy/validate-release-evidence.mjs"

const executeFile = promisify(execFile)
const validatorPath = fileURLToPath(
  new URL("../../scripts/deploy/validate-release-evidence.mjs", import.meta.url),
)
const localV2FixtureEvidence = {
  environment: "production",
  origin: "https://release-fixture.example.com",
  deploymentId: "local-fixture-v2-deployment",
  rollbackDeploymentId: "local-fixture-v2-rollback",
  migrationVersion: "20260904055749",
  schemaVersion: "2.0.0",
  catalogVersion: "local-fixture-v2-catalog-20260904",
  manifestHash: "a".repeat(64),
  placeCount: 100,
  menuCount: 100,
  approvalCount: 100,
  recheckCount: 20,
  providers: { supabase: "verified", naver: "verified", posthog: "verified" },
  smokePassed: true,
  e2ePassed: true,
  capturedAt: "2026-09-04T00:00:00.000Z",
}
const createCurrentV2FixtureEvidence = () => ({
  ...localV2FixtureEvidence,
  capturedAt: new Date().toISOString(),
})

const withTemporaryReleaseEvidenceDirectory = async (action) => {
  const directory = await mkdtemp(join(tmpdir(), "healthmap-release-evidence-"))
  try {
    return await action(directory)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

test("release evidence accepts the current v2 contract for a local fixture", () => {
  assert.deepEqual(validateReleaseEvidence(localV2FixtureEvidence, "2026-09-04T12:00:00.000Z"), [])
})

test("release evidence rejects legacy and crossed migration/schema contract pairs", () => {
  const invalidContractPairs = [
    {
      migrationVersion: "20260822130000",
      name: "legacy v1 release proof",
      schemaVersion: "1.0.0",
    },
    {
      migrationVersion: CURRENT_RELEASE_EVIDENCE_CONTRACT.migrationVersion,
      name: "current migration with legacy schema",
      schemaVersion: "1.0.0",
    },
    {
      migrationVersion: "20260822130000",
      name: "legacy migration with current schema",
      schemaVersion: CURRENT_RELEASE_EVIDENCE_CONTRACT.schemaVersion,
    },
  ]

  for (const invalidPair of invalidContractPairs) {
    const { name, ...invalidContractPair } = invalidPair
    assert.deepEqual(
      validateReleaseEvidence(
        { ...localV2FixtureEvidence, ...invalidContractPair },
        "2026-09-04T12:00:00.000Z",
      ),
      ["contract"],
      name,
    )
  }
})

test("release evidence rejects stale, partial, unknown, and secret-shaped proofs", () => {
  const failures = validateReleaseEvidence(
    {
      ...localV2FixtureEvidence,
      placeCount: 99,
      approvalCount: 98,
      capturedAt: "2026-09-01T00:00:00.000Z",
      serviceRole: "must-not-appear",
    },
    "2026-09-04T12:00:00.000Z",
  )
  assert.deepEqual(failures.sort(), ["contract", "freshness", "secret", "unknown-fields"])
})

test("release evidence rejects timestamps more than the clock-skew allowance in the future", () => {
  assert.deepEqual(
    validateReleaseEvidence(
      { ...localV2FixtureEvidence, capturedAt: "2026-09-06T12:00:00.000Z" },
      "2026-09-04T12:00:00.000Z",
    ),
    ["freshness"],
  )
})

test("release evidence accepts timestamps at the five-minute future clock-skew boundary", () => {
  assert.deepEqual(
    validateReleaseEvidence(
      { ...localV2FixtureEvidence, capturedAt: "2026-09-04T12:05:00.000Z" },
      "2026-09-04T12:00:00.000Z",
    ),
    [],
  )
})

test("release evidence temporary workspaces are removed after completed and rejected work", async () => {
  let completedDirectory = ""
  await withTemporaryReleaseEvidenceDirectory(async (directory) => {
    completedDirectory = directory
    await writeFile(join(directory, "evidence.json"), JSON.stringify(localV2FixtureEvidence))
  })
  await assert.rejects(lstat(completedDirectory), { code: "ENOENT" })

  let rejectedDirectory = ""
  await assert.rejects(
    withTemporaryReleaseEvidenceDirectory(async (directory) => {
      rejectedDirectory = directory
      await writeFile(join(directory, "evidence.json"), JSON.stringify(localV2FixtureEvidence))
      throw new TypeError("simulated cancellation")
    }),
    /simulated cancellation/,
  )
  await assert.rejects(lstat(rejectedDirectory), { code: "ENOENT" })
})

test("release evidence CLI accepts a current local v2 fixture", async () => {
  await withTemporaryReleaseEvidenceDirectory(async (directory) => {
    const path = join(directory, "local-fixture-evidence.json")
    await writeFile(path, JSON.stringify(createCurrentV2FixtureEvidence()))
    const { stderr, stdout } = await executeFile(process.execPath, [validatorPath, path])
    assert.equal(stderr, "")
    assert.equal(stdout, "Release evidence validation passed\n")
  })
})

test("release evidence CLI reports only categories and never fixture values", async () => {
  await withTemporaryReleaseEvidenceDirectory(async (directory) => {
    const path = join(directory, "local-fixture-evidence.json")
    await writeFile(
      path,
      JSON.stringify({ ...createCurrentV2FixtureEvidence(), origin: "https://fixture.invalid" }),
    )
    await assert.rejects(executeFile(process.execPath, [validatorPath, path]), (error) => {
      assert.equal(error.code, 1)
      assert.equal(error.stdout, "")
      assert.equal(error.stderr, "Release evidence validation failed: origin\n")
      assert.doesNotMatch(error.stderr, /fixture\.invalid/)
      return true
    })
  })
})
