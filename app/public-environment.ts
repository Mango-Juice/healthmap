import { z } from "zod"

export const PUBLIC_ENVIRONMENT_NAMES = [
  "NEXT_PUBLIC_NAVER_MAP_CLIENT_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_SITE_URL",
] as const

export type PublicEnvironmentName = (typeof PUBLIC_ENVIRONMENT_NAMES)[number]

type PublicEnvironmentInput = Readonly<Record<string, string | undefined>>

type ParsedPublicEndpoint = Readonly<{
  readonly key: string
  readonly url: string
}>

export type ParsedPublicEnvironment = Readonly<{
  readonly analytics: ParsedPublicEndpoint | null
  readonly catalog: ParsedPublicEndpoint | null
  readonly invalid: readonly PublicEnvironmentName[]
  readonly missing: readonly PublicEnvironmentName[]
  readonly siteUrl: string | null
}>

const NonEmptyStringSchema = z.string().trim().min(1)
const PlaywrightLoopbackFlagSchema = z.literal("1")

const readValue = (
  environment: PublicEnvironmentInput,
  name: PublicEnvironmentName,
): string | null => {
  const parsed = NonEmptyStringSchema.safeParse(environment[name])
  return parsed.success ? parsed.data : null
}

const isLoopbackHostname = (hostname: string): boolean =>
  hostname === "localhost" || hostname === "::1" || /^127(?:[.]\d{1,3}){3}$/.test(hostname)

const isAllowedPublicUrl = (value: string, allowHttpLoopback: boolean): boolean => {
  try {
    const url = new URL(value)
    if (url.username || url.password || !url.hostname) return false
    return (
      url.protocol === "https:" ||
      (allowHttpLoopback && url.protocol === "http:" && isLoopbackHostname(url.hostname))
    )
  } catch {
    return false
  }
}

const endpoint = (
  environment: PublicEnvironmentInput,
  allowHttpLoopback: boolean,
  keyName: PublicEnvironmentName,
  urlName: PublicEnvironmentName,
): Readonly<{
  readonly invalid: readonly PublicEnvironmentName[]
  readonly value: ParsedPublicEndpoint | null
}> => {
  const key = readValue(environment, keyName)
  const url = readValue(environment, urlName)
  if (key === null && url === null) return { invalid: [], value: null }
  if (key === null || url === null) return { invalid: [], value: null }
  const invalid: PublicEnvironmentName[] = !isAllowedPublicUrl(url, allowHttpLoopback)
    ? [urlName]
    : []
  return invalid.length === 0 ? { invalid, value: { key, url } } : { invalid, value: null }
}

const parseEnvironment = (
  environment: PublicEnvironmentInput,
  allowHttpLoopback: boolean,
): ParsedPublicEnvironment => {
  const catalog = endpoint(
    environment,
    allowHttpLoopback,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
  )
  const analytics = endpoint(
    environment,
    allowHttpLoopback,
    "NEXT_PUBLIC_POSTHOG_KEY",
    "NEXT_PUBLIC_POSTHOG_HOST",
  )
  const siteUrl = readValue(environment, "NEXT_PUBLIC_SITE_URL")
  const invalidSiteUrl: PublicEnvironmentName[] =
    siteUrl !== null && !isAllowedPublicUrl(siteUrl, allowHttpLoopback)
      ? ["NEXT_PUBLIC_SITE_URL"]
      : []
  const invalid: PublicEnvironmentName[] = [
    ...catalog.invalid,
    ...analytics.invalid,
    ...invalidSiteUrl,
  ]
  const missing = PUBLIC_ENVIRONMENT_NAMES.filter((name) => readValue(environment, name) === null)

  return {
    analytics: analytics.value,
    catalog: catalog.value,
    invalid,
    missing,
    siteUrl: siteUrl !== null && isAllowedPublicUrl(siteUrl, allowHttpLoopback) ? siteUrl : null,
  }
}

export const parsePublicEnvironment = (
  environment: PublicEnvironmentInput,
): ParsedPublicEnvironment => parseEnvironment(environment, false)

export const parsePlaywrightPublicEnvironment = (
  environment: PublicEnvironmentInput,
): ParsedPublicEnvironment =>
  parseEnvironment(
    environment,
    PlaywrightLoopbackFlagSchema.safeParse(environment["NEXT_PUBLIC_TEST_ALLOW_HTTP_LOOPBACK"])
      .success &&
      PlaywrightLoopbackFlagSchema.safeParse(environment["NEXT_PUBLIC_PLAYWRIGHT_TEST"]).success,
  )

export const getMissingPublicEnvironmentNames = (
  environment: PublicEnvironmentInput,
): readonly PublicEnvironmentName[] => parsePublicEnvironment(environment).missing
