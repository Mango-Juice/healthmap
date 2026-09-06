# TESTS KNOWLEDGE BASE

## OVERVIEW

- Five separated suites: unit, integration, architecture, deployment, and E2E.
- Vitest owns unit/integration; Node's test runner owns architecture/deployment; Playwright owns E2E.
- E2E also boots a typed task7 fixture app for production-provider/action paths.

## STRUCTURE

```text
tests/
├── unit/                         # Pure/domain, analytics, security, primitive contracts
├── integration/                  # Catalog parser, schema, and SQL boundary contracts
├── architecture/                # Current FoodMap boundary and cycle checks
├── deployment/                  # Environment and HTTP smoke automation contracts
├── e2e/                          # Browser behavior, accessibility, privacy, visual contracts
└── fixtures/task7-app/           # Separate Next fixture; nested AGENTS.md applies
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Unit suite selection | `vitest.config.ts` | Includes only `tests/unit/**/*.test.{ts,tsx}` |
| Integration suite selection | `vitest.integration.config.ts` | Includes only `tests/integration/**/*.test.ts` |
| Browser runner | `playwright.config.ts` | `tests/e2e`, base URL `127.0.0.1:3417`, Chromium project |
| Typed provider fixture | `e2e/place-actions-fixture-server.ts`, `fixtures/task7-app/` | Starts and tears down a second Next app |

## CONVENTIONS

- `pnpm test` runs the Vercel config check, then shuffled unit tests with fixed seed `20260813`.
- E2E scenarios deliberately exercise `375x812`, `768x1024`, and `1280x800` viewports where relevant.
- E2E assertions cover reduced motion, focus entry/restoration/trapping, browser history/share URLs, and provider-backed fixture data.
- `playwright.config.ts` defines only `chromium` using Desktop Chrome; do not imply Firefox/WebKit coverage.
- Coverage is not configured and has no threshold; test completion is pass/fail plus relevant artifacts.
- `place-actions-fixture-server.ts` restores `next-env.d.ts` and `tsconfig.json`, and removes `.next-task7-*` output after its run.

## ANTI-PATTERNS

- Do not merge suite globs or move a test to make it run under a different command.
- Do not hand-edit generated fixture `next-env.d.ts`, `.next-task7-*` output, or generated fixture spec state.
- Do not alter fixture provider environment/cleanup behavior without preserving production/mock isolation.
- Do not add a non-Chromium Playwright project or silently drop viewport, motion, focus, or history assertions.
- Do not introduce coverage thresholds or report coverage as a repository gate.

## COMMANDS

- Unit: `pnpm test`
- Integration: `pnpm test:integration`
- Local Supabase integration (Task 7): `pnpm test:integration:local`
- Architecture: `node --test tests/architecture/*.test.mjs`
- Deployment: `pnpm test:deployment`
- Deployment checks: `pnpm deploy:validate` and `pnpm deploy:smoke`
- E2E (Chromium only): `pnpm test:e2e`
