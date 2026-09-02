import { readFile } from "node:fs/promises"

const EXPECTED_KEYS = [
  "approvalCount",
  "capturedAt",
  "catalogVersion",
  "deploymentId",
  "e2ePassed",
  "environment",
  "manifestHash",
  "menuCount",
  "migrationVersion",
  "origin",
  "placeCount",
  "providers",
  "recheckCount",
  "rollbackDeploymentId",
  "schemaVersion",
  "smokePassed",
]
const SECRET_PATTERN = /(?:service.?role|authorization|bearer\s+|sk_(?:live|test)_)/i
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000

export function validateReleaseEvidence(value, nowIso = new Date().toISOString()) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return ["contract"]
  const failures = []
  const keys = Object.keys(value).sort()
  if (keys.join(",") !== EXPECTED_KEYS.join(",")) failures.push("unknown-fields")
  if (SECRET_PATTERN.test(JSON.stringify(value))) failures.push("secret")
  let originIsValid = false
  try {
    const origin = new URL(value.origin)
    originIsValid =
      origin.protocol === "https:" &&
      origin.username === "" &&
      origin.password === "" &&
      !origin.hostname.endsWith(".invalid") &&
      origin.pathname === "/" &&
      origin.search === "" &&
      origin.hash === ""
  } catch {
    originIsValid = false
  }
  if (!originIsValid) failures.push("origin")
  const providers = value.providers
  const providersValid =
    typeof providers === "object" &&
    providers !== null &&
    !Array.isArray(providers) &&
    Object.keys(providers).sort().join(",") === "naver,posthog,supabase" &&
    Object.values(providers).every((status) => status === "verified")
  const countsValid =
    Number.isInteger(value.placeCount) &&
    value.placeCount >= 100 &&
    Number.isInteger(value.menuCount) &&
    value.menuCount >= value.placeCount &&
    value.approvalCount === value.placeCount &&
    value.recheckCount === Math.ceil(value.placeCount / 5)
  const contractValid =
    ["preview", "production"].includes(value.environment) &&
    typeof value.deploymentId === "string" &&
    value.deploymentId.length > 0 &&
    typeof value.rollbackDeploymentId === "string" &&
    value.rollbackDeploymentId.length > 0 &&
    value.migrationVersion === "20260822130000" &&
    value.schemaVersion === "1.0.0" &&
    typeof value.catalogVersion === "string" &&
    value.catalogVersion.length > 0 &&
    typeof value.manifestHash === "string" &&
    /^[a-f0-9]{64}$/.test(value.manifestHash) &&
    countsValid &&
    providersValid &&
    value.smokePassed === true &&
    value.e2ePassed === true
  if (!contractValid) failures.push("contract")
  const capturedAt = Date.parse(value.capturedAt)
  const now = Date.parse(nowIso)
  if (
    !Number.isFinite(capturedAt) ||
    !Number.isFinite(now) ||
    now - capturedAt > 86_400_000 ||
    capturedAt - now > MAX_FUTURE_CLOCK_SKEW_MS
  )
    failures.push("freshness")
  return failures
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const evidencePath = process.argv[2]
  if (!evidencePath) {
    console.error("Release evidence validation failed: path")
    process.exitCode = 2
  } else {
    try {
      const value = JSON.parse(await readFile(evidencePath, "utf8"))
      const failures = validateReleaseEvidence(value)
      if (failures.length > 0) {
        console.error(`Release evidence validation failed: ${failures.join(", ")}`)
        process.exitCode = 1
      } else {
        console.log("Release evidence validation passed")
      }
    } catch {
      console.error("Release evidence validation failed: unreadable")
      process.exitCode = 1
    }
  }
}
