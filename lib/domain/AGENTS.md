# DOMAIN KNOWLEDGE BASE

## OVERVIEW

Pure business contracts and deterministic state transformations for catalog, map geography, sharing, directions, filtering, and analytics. This layer has no framework, browser, database, or provider side effects.

## WHERE TO LOOK

- `contracts.ts`: branded `PlaceId`, `PlaceSlug`, and `MenuId`; health-tag literals.
- `catalog.ts`: v1/v2 union and row dispatch; `catalog-v1.ts` and `catalog-v2.ts` own versioned schemas/adapters.
- `menu-facts.ts`: v2 menu facts; `public-place-links.ts`: exact-place versus clean NAVER search links.
- `geo.ts`: bounded map/location values and exhaustive browser-location outcomes.
- `filter.ts`: categories, ingredient and cooking conditions that must match the same menu; `share.ts`: URL parsing, validation, and canonical serialization.
- `directions.ts`: production-only NAVER route/place target selection; `analytics.ts`: event allowlist and parser.

## CONVENTIONS

- Treat `unknown` and database rows as untrusted: parse with strict, readonly Zod schemas before producing domain values.
- Keep domain fields camelCase; keep persistence row fields snake_case and convert them only in the versioned catalog adapters.
- Preserve the fixed `dataMode: "production"` contract through every catalog value; use exhaustive switches for other discriminated domain values.
- Prefer total, deterministic, side-effect-free functions. Do not mutate inputs; return readonly arrays and state objects.
- Keep branded IDs and validated health tags at API boundaries; do not replace them with unconstrained strings.
- Analytics is an allowlist: emit only `ANALYTICS_EVENT_NAMES` and the strict, redacted discriminated properties accepted by `parseAnalyticsEvent`. Current discovery additions are `search_used`, `search_area_applied`, and `result_list_opened`; `search_used` carries only the coarse result-count bucket, the latter two are propertyless, and `place_opened` permits only a validated opaque `PlaceId` plus its declared source. Never add query text, names, addresses, menus, coordinates, URLs/referrers, or open-ended properties.

## ANTI-PATTERNS

- Do not construct `Place` or `Menu` directly from raw rows, bypass Zod, loosen `.strict().readonly()`, or discard refinement failures.
- Do not mix snake_case persistence records into domain consumers or widen the production-only `dataMode` contract to an unlabelled or legacy value.
- Do not add I/O, browser globals, SDK calls, randomness, current-time reads, or provider credentials to these pure modules.
- Do not add event variants or open-ended property bags outside `ANALYTICS_EVENT_NAMES` and its discriminated schemas.
- Do not introduce mock catalog rows or sample destinations; production directions use the validated NAVER URL.

## VALIDATION

- `pnpm verify:domain`: runs the contract driver for row parsing, canonical share URLs, location outcomes, filtering, and analytics rejection cases.
- `pnpm test:integration`: exercises catalog row parsing and schema contracts against malformed and valid inputs.
- `pnpm test`: runs the deterministic shuffled unit/config suite; `pnpm typecheck` enforces strict TypeScript contracts.

Discovery uses bounded public menu facts and applicability without invented health tags. Keep its contracts separate from reviewed catalog rows.
