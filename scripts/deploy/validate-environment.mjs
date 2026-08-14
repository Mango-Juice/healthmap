export const PUBLIC_ENVIRONMENT_NAMES = [
  "NEXT_PUBLIC_NAVER_MAP_CLIENT_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_SITE_URL",
]

const URL_ENVIRONMENT_NAMES = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_SITE_URL",
])

function isValidPublicUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname.length > 0
  } catch {
    return false
  }
}

export function validatePublicEnvironment(environment) {
  const missing = []
  const malformed = []

  for (const name of PUBLIC_ENVIRONMENT_NAMES) {
    const value = environment[name]?.trim()
    if (!value) {
      missing.push(name)
    } else if (URL_ENVIRONMENT_NAMES.has(name) && !isValidPublicUrl(value)) {
      malformed.push(name)
    }
  }

  return { malformed, missing }
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
