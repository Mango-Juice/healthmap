import { unstable_cache } from "next/cache"
import { PUBLIC_CATALOG_REVALIDATE_SECONDS } from "./cache.ts"
import type { PublicCatalog, PublicCatalogRepository } from "./repository.ts"

export type PublicCatalogReader = () => Promise<PublicCatalog>
export const NEXT_PUBLIC_CATALOG_CACHE_POLICY = {
  revalidateSeconds: PUBLIC_CATALOG_REVALIDATE_SECONDS,
  tag: "public-catalog",
} as const

export const createNextPublicCatalogReader = (
  repository: PublicCatalogRepository,
): PublicCatalogReader =>
  unstable_cache(() => repository.getPublicCatalog(), [NEXT_PUBLIC_CATALOG_CACHE_POLICY.tag], {
    revalidate: NEXT_PUBLIC_CATALOG_CACHE_POLICY.revalidateSeconds,
    tags: [NEXT_PUBLIC_CATALOG_CACHE_POLICY.tag],
  })
