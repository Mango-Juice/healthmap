# OVERVIEW

- `MapDiscovery` is retained for fixtures; the deployed FoodMap owns the current discovery surface. It composes catalog, SDK, location, filter, and detail hooks.
- `MapDiscoverySurface` receives the assembled model and owns map/detail DOM; keep state/effects in hooks.
- The production-only surface renders explicit loading, empty, error, and location outcomes while NAVER or the catalog resolve; it never falls back to a sample catalog or synthetic map.

# WHERE TO LOOK

- `map-discovery.tsx`: orchestration and published/visible-place derivation.
- `map-discovery-surface.tsx`, `place-detail.tsx`, and the two CSS modules: map shell, detail pane/dialog, and scroll ownership.
- `use-catalog.ts`, `use-location-control.ts`, `use-naver-map-adapter.ts`: async catalog, geolocation, and SDK lifecycles.
- `use-detail-selection.ts`, `use-detail-surface.ts`, `detail-history.ts`: share URLs, browser history, focus restoration, and motion phases.
- `lib/map/adapter.ts`: only NAVER SDK loading, construction, recentering, and destruction seam.
- `tests/e2e/place-actions-fixture.spec.ts` and `tests/e2e/place-actions-fixture-recovery.spec.ts`: retained fixture-only reviewed-catalog action and recovery contracts. The current root FoodMap boundary is checked by `tests/architecture/map-discovery-architecture.test.mjs`.

# CONVENTIONS

- Keep orchestration in `MapDiscovery`; keep rendering in `MapDiscoverySurface`; add behavior to the narrowest hook.
- Preserve the local import DAG so the fixture-only reviewed map remains isolated from the current FoodMap boundary.
- Route all SDK access through `lib/map/adapter.ts`; `useNaverMapAdapter` must invalidate late loads with its generation token and cancel/destroy on cleanup.
- Async catalog reloads use a monotonically increasing generation token; stale responses never replace current data or state.
- Detail open stores the map snapshot, replaces the map history entry, then pushes the canonical place URL; close replaces `/` and completes after the transition.
- `popstate` rehydrates filter/view/detail from validated share state or snapshot; malformed and unpublished links return to the base map with a notice.
- Capture the opening trigger and restore it with `preventScroll`; focus the detail title on entry and trap mobile dialog Tab focus.
- Respect reduced motion: settle opening immediately and finish closing without a transition; normal close retains the safety timeout.
- The desktop result list occupies the existing 352px inline-end discovery surface; opening a marker or result replaces that list with detail in the same surface, and Back-to-results restores it without unmounting map/search/filter state.
- On mobile, the result list is an explicit, non-draggable bottom tray; detail replaces the tray and Back-to-results restores it. Drag or gesture is never a required path.
- Exactly one vertical scroll owner is permitted: the active mobile list/detail tray body or the active desktop inline-end list/detail pane body. The page and map shell never scroll behind it. Preserve the phase/motion data attributes used by CSS and E2E.
- Use `captureProductAnalytics` with the allowlisted event/property shapes only; never attach names, addresses, coordinates, URLs, referrers, or credentials.

# ANTI-PATTERNS

- Do not import or call `window.naver` from map components, or construct a second SDK loader/adapter.
- Do not move URL/history recovery into the surface, or bypass validated share/history helpers.
- Do not set state from a superseded catalog/SDK request, or remove generation/cancellation cleanup.
- Do not make the page or map shell scroll; do not drop focus restoration, dialog trapping, reduced-motion handling, or transition completion.
- Do not emit raw place/map data in analytics, or introduce sample/mock records or labels into the production-only discovery flow.

# VALIDATION

- `pnpm test:architecture` — verifies the root FoodMap boundary and current module DAG.
- `pnpm test:e2e -- tests/e2e/place-actions-fixture.spec.ts tests/e2e/place-actions-fixture-recovery.spec.ts` — exercises retained fixture directions, detail, redacted analytics, and unpublished-place recovery.
- `pnpm test:e2e -- tests/e2e/discovery.spec.ts tests/e2e/discovery-national.spec.ts tests/e2e/discovery-place-browsing.spec.ts` — covers current-root search, filters, detail focus, paging, errors, scroll, and dismissal.
