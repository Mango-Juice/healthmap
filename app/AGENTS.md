# APP ROUTER KNOWLEDGE BASE

## OVERVIEW

Next.js App Router boundary for the root FoodMap, bounded snapshot APIs, suggestion intake, metadata,
privacy controls and design showcase. Reviewed-catalog endpoints remain separate tooling.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Root shell | `layout.tsx` | Korean document, metadata base, analytics bootstrap |
| Root route | `page.tsx` | FoodMap and root canonical metadata; no catalog-provider branch |
| Legacy place | `places/[slug]/page.tsx` | Permanent redirect to `/` |
| Current map | `page.tsx`, `api/places/` | One root UI with bounded snapshot queries and place details |
| Proposals | `suggest/page.tsx`, `api/suggestions/route.ts` | Place context, private server intake and unavailable states |
| Reviewed-catalog API | `api/map-catalog/route.ts` | Dynamic JSON GET or `{}` with HTTP 503 |
| Public configuration | `public-environment.ts` | Shared URL/key parsing used by catalog and analytics |
| Metadata routes | `robots.ts`, `sitemap.ts` | Noindex policy and an empty sitemap |
| Privacy | `privacy/` | User-facing policy and local analytics opt-out |
| Design contract | `showcase/` | Interactive primitive/state examples; not the production map entry |

## CURRENT ROUTE POLICY

- `/` always renders FoodMap. No retired alternate UI branch remains.
- Root stays noindex with a root canonical URL; sitemap is empty. Metadata must not call the retired catalog provider.
- `/suggest?placeId=...` resolves an eligible snapshot place on the server; all return links lead to `/`.
- The current APIs are `/api/places` and `/api/places/[id]`, with unchanged DTO privacy and validity rules.
- Obsolete scope parameters are ignored; they neither grant privileges nor select a different storage path.

## CONVENTIONS

- Keep route pages, layouts, metadata, and provider reads as Server Components. Add `"use client"`
  only to interaction or browser-lifecycle leaves such as analytics, privacy preference, and showcase.
- Treat App Router `params` and `searchParams` as promises, matching the installed Next.js version.
- Keep snapshot and reviewed-catalog APIs dynamic so validity checks run when data is read.
- Preserve route-specific semantics: current places APIs return explicit 400/404/409/503 errors as applicable;
  the reviewed API returns 503 on provider failure. Sitemap stays empty; the legacy place page redirects to `/`.
- The retired reviewed-catalog helpers and OG loader remain for tooling; application pages do not render their map.
- Metadata fails closed when `NEXT_PUBLIC_SITE_URL` is unavailable: no canonical, no indexing, and
  robots disallows the site. Loopback HTTP is test-only through the paired Playwright flags.
- Default exports are for framework entrypoints only; use the narrow Biome suppression when an App Router
  file is not covered by the root override. Keep route-specific styles local to CSS Modules or route CSS.

## ANTI-PATTERNS

- Reviewed catalog routes use `getPublicCatalogRuntimeProvider`; current places routes use the bounded discovery reader and safe DTO projection.
- The suggestion route uses `submitSuggestion`; secret keys are server-only. The intake does not publish catalog changes.
- Do not synthesize catalog data, expose unpublished slugs, or turn provider failure into a success payload.
- Do not duplicate canonical/share/metadata policy across page, sitemap, robots, and OG-image modules.
- Do not let the showcase become a second production map path or redefine canonical `--hm-*` tokens.

## VALIDATION

- Root/API changes: `pnpm exec vitest run tests/unit/root-route.test.ts tests/unit/discovery-api.test.ts`.
- Intake changes: `pnpm exec vitest run tests/unit/suggestions.test.ts`.
- Route removal: check actual HTTP status and not-found recovery in the browser.
- Older reviewed-catalog E2E contracts are not current MVP page expectations; update only the relevant scope.
