import {
  parsePlaywrightPublicEnvironment,
  parsePublicEnvironment,
} from "../app/public-environment.ts"
import type { PlaceSlug } from "./domain/contracts.ts"
import { type MapShareQuery, serializeMapShareQuery } from "./domain/share-query.ts"

type SiteEnvironment = Readonly<Record<string, string | undefined>>

const isPlaywrightEnvironment = (environment: SiteEnvironment): boolean =>
  environment["NEXT_PUBLIC_PLAYWRIGHT_TEST"] === "1" &&
  environment["NEXT_PUBLIC_TEST_ALLOW_HTTP_LOOPBACK"] === "1"

export const getValidatedSiteUrl = (environment: SiteEnvironment): URL | null => {
  const parsed = isPlaywrightEnvironment(environment)
    ? parsePlaywrightPublicEnvironment(environment)
    : parsePublicEnvironment(environment)
  if (parsed.siteUrl === null) return null

  const siteUrl = new URL(parsed.siteUrl)
  siteUrl.hash = ""
  siteUrl.search = ""
  if (!siteUrl.pathname.endsWith("/")) siteUrl.pathname = `${siteUrl.pathname}/`
  return siteUrl
}

export const buildAbsoluteSiteUrl = (
  pathname: string,
  environment: SiteEnvironment,
): string | null => {
  const siteUrl = getValidatedSiteUrl(environment)
  if (siteUrl === null) return null
  return new URL(pathname.replace(/^[/]/u, ""), siteUrl).toString()
}

export const buildAbsolutePlaceShareUrl = (
  slug: PlaceSlug,
  environment: SiteEnvironment,
): string | null => buildAbsoluteSiteUrl(`places/${encodeURIComponent(slug)}`, environment)

export const buildAbsoluteMapShareUrl = (
  state: MapShareQuery,
  environment: SiteEnvironment,
): string | null => buildAbsoluteSiteUrl(`?${serializeMapShareQuery(state)}`, environment)

export const getRuntimeSiteEnvironment = (): SiteEnvironment => ({
  NEXT_PUBLIC_PLAYWRIGHT_TEST: process.env["NEXT_PUBLIC_PLAYWRIGHT_TEST"],
  NEXT_PUBLIC_SITE_URL: process.env["NEXT_PUBLIC_SITE_URL"],
  NEXT_PUBLIC_TEST_ALLOW_HTTP_LOOPBACK: process.env["NEXT_PUBLIC_TEST_ALLOW_HTTP_LOOPBACK"],
})
