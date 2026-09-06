# ANALYTICS KNOWLEDGE BASE

## OVERVIEW

Browser-only privacy boundary for PostHog lifecycle, anonymous local preference state, queueing, and
schema-redacted event transport. Product behavior must remain independent of analytics availability.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Browser lifecycle | `browser.ts` | Environment parsing, queue, PostHog client, opt-out transitions |
| Privacy transport | `privacy-safe.ts` | Anonymous ID, storage keys, event sanitization, failure isolation |
| Event contract | `../domain/analytics.ts` | Only allowed event names and discriminated properties |
| Root boot | `../../app/analytics-bootstrap.tsx` | Initializes from public environment values |
| User control | `../../app/privacy/privacy-preference.tsx` | Reads and changes the local opt-out preference |

## CONVENTIONS

- Analytics is opted out until local storage explicitly contains `"false"`; never send on a missing,
  blocked, or malformed preference. Anonymous IDs are validated UUIDs stored only under the versioned key.
- Parse every capture through `parseAnalyticsEvent`, then sanitize the PostHog `before_send` payload again.
  Transport properties are the schema allowlist, plus `$geoip_disable`; all other SDK properties are dropped.
- Keep PostHog autocapture, page/session capture, durable persistence, surveys, feature flags, profiles,
  and GeoIP disabled. The SDK uses memory-only persistence and the app-owned anonymous ID.
- Preserve the bounded 32-event pre-initialization queue, singleton global lifecycle, and generation check.
  Opt-out clears queued work and invalidates an initialization that completes late.
- Storage, SDK initialization, opt-in/out, and transport failures are non-fatal. They must not surface to
  routes, map interactions, privacy controls, or the console as product errors.

## ANTI-PATTERNS

- Never attach search text, names, addresses, menus, coordinates, URLs, referrers, credentials, user-agent
  detail, or open-ended property bags.
- Never call PostHog directly from app/components, bypass either schema pass, or enable automatic capture.
- Never replace local opt-out semantics with cookie, account, device-fingerprint, or server-side identity.
- Never let analytics readiness delay rendering, navigation, catalog work, or user interaction.

## VALIDATION

- `pnpm exec vitest run tests/unit/analytics/privacy-analytics.test.ts tests/unit/analytics/privacy-analytics-wire.test.ts`
- `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/analytics-wire.test.ts`
- `pnpm test:e2e -- tests/e2e/privacy.spec.ts tests/e2e/discovery-analytics.spec.ts`
