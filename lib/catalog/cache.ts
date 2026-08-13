import type { PublicCatalog, PublicCatalogRepository } from "./repository.ts"

export interface Clock {
  nowMilliseconds(): number
}

export interface PublicCatalogCache {
  get(): Promise<PublicCatalog>
  invalidate(): void
}

export const PUBLIC_CATALOG_REVALIDATE_SECONDS = 300

export const createPublicCatalogCache = (
  repository: PublicCatalogRepository,
  clock: Clock,
): PublicCatalogCache => {
  let entry: { readonly value: PublicCatalog; readonly loadedAt: number } | undefined
  let pending: Promise<PublicCatalog> | undefined

  return {
    get: async () => {
      const now = clock.nowMilliseconds()
      if (entry !== undefined && now - entry.loadedAt < PUBLIC_CATALOG_REVALIDATE_SECONDS * 1000) {
        return entry.value
      }
      if (pending !== undefined) return pending

      const load = repository.getPublicCatalog().then((value) => {
        entry = { value, loadedAt: clock.nowMilliseconds() }
        return value
      })
      pending = load.finally(() => {
        pending = undefined
      })
      return pending
    },
    invalidate: () => {
      entry = undefined
    },
  }
}
