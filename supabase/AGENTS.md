# SUPABASE KNOWLEDGE BASE

## OVERVIEW

Supabase is a private operational boundary. Public reads use a narrow RPC; privileged data management remains outside this repository.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Migrations | `migrations/` | Schema and access-control changes |
| Local runtime | `config.toml` | Development configuration |
| SQL contracts | `../tests/integration/` | Parser, RPC, and RLS contracts |

## CONVENTIONS

- Migrations are immutable once applied. Use a later migration for a correction.
- Keep direct public table reads and writes revoked. Public access crosses a narrow reader; administrative operations remain service-role-only.
- Preserve RLS, explicit grants, secure function configuration, and atomic failure behavior.
- Keep `seed.sql` empty. Test rows belong to guarded local verification.
- Preserve HTTPS URL constraints and data-validity checks.

## ANTI-PATTERNS

- Do not edit an applied migration, relax RLS/grants, expose private schemas, or broaden a definer function.
- Do not put service-role keys or operational data in public environment variables, logs, or docs.
- Do not patch applied data to hide a failure; use a forward migration or rollback procedure.
- Do not treat local checks as hosted proof.

## VALIDATION

- `pnpm test:integration` for static migration/schema contracts.
- `pnpm test:deployment` for deployment contracts.
- `pnpm test:integration:local` for local Supabase/RLS/RPC verification.
- Read private operational documentation before a migration or incident response.

## HOSTED INTAKE

Keep operator-only identifiers, operational records, and deployment procedures outside this repository. Suggestions remain private until the server validates and accepts them; public clients receive no administrative access.
