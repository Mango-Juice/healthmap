export const PUBLIC_ENVIRONMENT_NAMES = [
  "NEXT_PUBLIC_NAVER_MAP_CLIENT_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_SITE_URL",
] as const

type PublicEnvironmentName = (typeof PUBLIC_ENVIRONMENT_NAMES)[number]

export function getMissingPublicEnvironmentNames(
  environment: Readonly<Record<string, string | undefined>>,
): readonly PublicEnvironmentName[] {
  return PUBLIC_ENVIRONMENT_NAMES.filter((name) => !environment[name])
}
