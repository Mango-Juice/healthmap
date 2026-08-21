# HealthMap

HealthMap is a Korean map-first healthy-food discovery application backed by NAVER Maps and a
public-read Supabase catalog. Product runtime is production-catalog only: missing catalog configuration
or unavailable data produces an explicit error and never substitutes committed sample places or markers.

Local setup, provider configuration, release checks, data import, rollback, and incident response are
documented in [`docs/operations.md`](docs/operations.md). Repository checks do not prove that a hosted
provider or deployment is live.
