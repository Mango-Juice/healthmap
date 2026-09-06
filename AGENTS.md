<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Healthmap contributor notes

Healthmap is a Korean map-first healthy-food discovery app built with Next.js App Router, React,
TypeScript, Zod, NAVER Maps, Supabase, PostHog Lite, Tailwind, and CSS Modules.

## Boundaries

- Read the relevant guide under `node_modules/next/dist/docs/` before changing Next.js code.
- Keep real records, source inputs, credentials, and operator material out of tracked source, tests, logs,
  and browser payloads. `NEXT_PUBLIC_*` values are never secrets.
- Use server-side bounded readers and public DTOs only. Do not add synthetic places, menus, basemaps, or
  CSS-positioned product markers.
- Do not edit applied migrations; use a forward migration or reviewed rollback. Keep `supabase/seed.sql`
  empty.
- `DESIGN.md` is binding for UI work. Preserve accessible focus restoration, explicit loading/empty/error
  states, and native SDK markers.

## Working conventions

- Use Node `>=22 <23`, pnpm `10.19.0`, strict TypeScript, and Biome.
- Prefer Server Components; use client components only for browser interaction boundaries.
- Parse external input with Zod. Use relative imports and bracket notation for environment variables.
- Keep unrelated worktree changes intact. Do not infer hosted configuration or deployment state from local
  checks.

## Checks

```sh
pnpm exec biome ci .
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:deployment
pnpm docs:check
pnpm test:e2e
pnpm build
```
