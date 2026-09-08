import { buildAbsoluteSiteUrl } from "./share-links.ts"

// Only production builds with a valid canonical URL may advertise indexable pages.
export const getIndexableSiteUrl = (
  environment: Readonly<Record<string, string | undefined>>,
): string | null => {
  if (
    environment["NODE_ENV"] !== "production" ||
    environment["NEXT_PUBLIC_PLAYWRIGHT_TEST"] === "1" ||
    (environment["VERCEL_ENV"] !== undefined && environment["VERCEL_ENV"] !== "production")
  )
    return null
  return buildAbsoluteSiteUrl("", environment)
}
