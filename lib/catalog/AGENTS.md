# CATALOG KNOWLEDGE BASE

## OVERVIEW

- Runtime boundary for the reviewed catalog; the deployed root FoodMap uses separate discovery contracts.
- Selects the public-read Supabase catalog RPC and yields domain `Place`/`Menu` contracts from one published snapshot.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Runtime selection | `runtime.ts` | Public environment parsing, Supabase RPC client, cache identity |
| Database boundary | `repository.ts` | Raw-row parsing and catalog integrity checks |
| In-process cache | `cache.ts` | Five-minute TTL, pending-read deduplication, invalidation |
| Next cache seam | `next-cache.ts` | `unstable_cache`, `public-catalog` tag, five-minute revalidation |
| Bounded queries | `query.ts`, `query-contract.ts`, `query-client.ts` | Region summaries, query/filter/bounds/cursor, menu parity |
| Canonical schemas | `../domain/catalog.ts` | Raw snake-case adapters and mode-specific Zod contracts |
| HTTP consumer | `../../app/api/map-catalog/route.ts` | Dynamic JSON endpoint; invalid reads become HTTP 503 |
| Current UI | `../../app/page.tsx` | Does not import this provider; uses the bounded snapshot API |
| Retained OG loader | `../../app/places/[slug]/place-data.ts` | Reviewed-place metadata for the legacy OG route; current page redirects and sitemap is empty |
| Focused tests | `../../tests/unit/domain/catalog-runtime.test.ts`, `catalog-repository-cache.test.ts` | Runtime, REST, repository, and cache behavior |

## CONVENTIONS

- `createPublicCatalogRuntimeProvider` calls `parsePublicEnvironment`: only a complete valid public Supabase pair selects the production catalog; missing, partial, or invalid configuration throws `PublicCatalogConfigurationError`.
- The Supabase client calls the public security-invoker catalog RPC with the publishable key in `apikey` and bearer headers; the RPC returns a validated public response.
- `createPublicCatalogRepository` parses every unknown response via `parsePlaceRows`/`parseMenuRows`, then requires published rows, one data mode, existing menu parents, and matching parent/menu modes.
- `createPublicCatalogCache` and `createNextPublicCatalogReader` share the five-minute policy; concurrent reads share one pending promise and failed loads remain retryable.
- `loadPublicCatalogQuery` validates the bounded query response before retained fixture-only browser consumers receive data.
- The API route returns `{}` with status `503` for configuration, fetch, parse, integrity, or mode failures; page and browser consumers handle that failure contract.

## ANTI-PATTERNS

- Never let raw Supabase rows, snake-case fields, or unknown response objects escape the domain parser.
- Never bypass mode, publication, foreign-key, or parent-mode integrity checks in the repository.
- Never expose or accept a service-role credential; this boundary uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Never introduce mock catalog rows, sample destinations, or synthetic production evidence.
- Never make browser code trust `/api/map-catalog` without `PublicCatalogResponseSchema` validation.
- Do not alter the applied database migration to conceal an import or integrity failure.

## VALIDATION

- `pnpm exec vitest run tests/unit/domain/catalog-runtime.test.ts tests/unit/domain/catalog-repository-cache.test.ts` covers runtime selection, REST query headers, cache identity/TTL, deduplication, and retry behavior.
- `pnpm exec vitest run tests/integration/catalog-row-parser.test.ts tests/integration/schema-contract.test.ts` covers raw-row rejection and the Supabase migration contract.
- The data verification command validates the production catalog contract and published snapshot integrity.
- `pnpm typecheck` and `pnpm biome ci .` validate strict types and formatting after catalog changes.
