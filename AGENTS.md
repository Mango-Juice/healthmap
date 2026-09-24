<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Healthmap contributor notes

Healthmap helps people in Korea find places and menu choices that fit their food preferences.
Prioritize useful menu data and working filters. `package.json` is the source for runtime and dependency
versions; use the existing Next.js App Router, TypeScript, Zod, and Biome conventions.

## Boundaries

- Keep raw/private records, source inputs, credentials, and operator material out of tracked source,
  tests, logs, and browser payloads. Expose permitted catalog data only through bounded server readers
  and public DTOs. `NEXT_PUBLIC_*` values are never secrets.
- Do not invent production places, menus, health claims, or basemaps. Synthetic test fixtures belong
  only in isolated tests. Use native NAVER SDK markers, not CSS-positioned product markers.
- Do not edit applied migrations; use a forward migration or reviewed rollback. Keep `supabase/seed.sql`
  empty.
- For UI changes, read `DESIGN.md` and preserve accessible focus restoration and explicit
  loading/empty/error states.

## Working conventions

- Use Node `>=22 <23`, pnpm `10.19.0`, and strict TypeScript.
- Prefer Server Components; use client components only for browser interaction boundaries.
- Parse external input with Zod. Use relative imports and bracket notation for environment variables.
- Read task-relevant files rather than the entire repository before each change. Continue through
  implementation, relevant verification, and fixes within the authorized scope.
- Keep unrelated worktree changes intact. Local checks do not establish hosted configuration,
  deployment state, actual user adoption, or retention.

## Verification

Choose checks for the changed behavior; this is a command reference, not a requirement to run every
suite after every edit. Cover affected semantic categories and existing flows. Complete the CI checks
required by `.github/workflows/ci.yml` when preparing a release or an explicitly requested full check.

| Change | Relevant checks |
| --- | --- |
| Instructions or documentation only | Review the diff, links, and referenced commands. |
| Application logic or types | `pnpm exec biome ci .`, `pnpm typecheck`, affected tests via `pnpm test` |
| Reader/API contracts | `pnpm test:integration` and affected unit tests |
| SQL, RLS, or migrations | `pnpm test:integration:local` |
| User interaction | Affected cases via `pnpm test:e2e` and visual inspection of the changed flow |
| Build or deployment behavior | `pnpm build`, `pnpm deploy:validate`, `pnpm test:deployment` |

`test:integration:local` uses a disposable PostgreSQL container with no host port; run and repair those
local checks without repeated approval. Local E2E uses fixtures when `E2E_BASE_URL` is unset; a set value
targets that hosted origin, so check it before running. Missing local prerequisites are not a reason to
switch to a production database. For an authorized hosted check, use
`pnpm deploy:smoke --base-url <origin>` and verify the browser journey separately.
