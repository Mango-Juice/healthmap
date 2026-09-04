import { PUBLIC_ENVIRONMENT_NAMES, parsePublicEnvironment } from "../../app/public-environment.ts"

export { PUBLIC_ENVIRONMENT_NAMES }

export function validatePublicEnvironment(environment) {
  const parsed = parsePublicEnvironment(environment)
  const required = ["NEXT_PUBLIC_NAVER_MAP_CLIENT_ID", "NEXT_PUBLIC_SITE_URL"]
  return {
    malformed: parsed.invalid,
    missing: parsed.missing.filter((name) => required.includes(name)),
  }
}

export function formatValidationFailure(result) {
  const invalidNames = [...result.missing, ...result.malformed]
  return invalidNames.length === 0
    ? "Environment validation passed"
    : `Environment validation failed: ${invalidNames.join(", ")}`
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = validatePublicEnvironment(process.env)
  const message = formatValidationFailure(result)
  const output =
    result.missing.length === 0 && result.malformed.length === 0 ? console.log : console.error
  output(message)
  process.exitCode = result.missing.length === 0 && result.malformed.length === 0 ? 0 : 1
}
