import { afterEach, describe, expect, it, vi } from "vitest"
import { currentPilotCatalog, PilotCatalogSchema } from "../../lib/pilot/catalog"
import pilotCatalogJson from "../../lib/pilot/pilot-catalog.json"

vi.mock("../../lib/pilot/server", () => ({ readPilotCatalog: vi.fn() }))

import { GET as getDetail } from "../../app/api/pilot/places/[id]/route"
import { GET as getList } from "../../app/api/pilot/route"
import { readPilotCatalog } from "../../lib/pilot/server"

const catalog = PilotCatalogSchema.parse(pilotCatalogJson)
afterEach(() => vi.unstubAllEnvs())
describe("Pilot HTTP handlers", () => {
  it("serves the public Pilot DTO without internal evidence when explicitly enabled", async () => {
    vi.stubEnv("HEALTHMAP_PUBLIC_PILOT", "1")
    vi.stubEnv("VERCEL_ENV", "production")
    vi.mocked(readPilotCatalog).mockReturnValue(catalog)
    const response = getList(new Request("http://localhost/api/pilot?limit=1"))
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('"total":465')
    expect(body).not.toContain('"evidence"')
    expect(body).not.toContain('"rawText"')
    expect(body).not.toContain('"sourceSha256"')
  })
  it("returns 404 for public production routes, even with the flag", async () => {
    vi.stubEnv("HEALTHMAP_PILOT_ENABLED", "1")
    vi.stubEnv("VERCEL_ENV", "production")
    expect(getList(new Request("http://localhost/api/pilot")).status).toBe(404)
    expect(
      (
        await getDetail(new Request("http://localhost"), {
          params: Promise.resolve({ id: "invalid" }),
        })
      ).status,
    ).toBe(404)
  })
  it("returns 404 for expired detail and 503 for unavailable snapshots", async () => {
    vi.stubEnv("HEALTHMAP_PILOT_ENABLED", "1")
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.mocked(readPilotCatalog).mockReturnValue(
      currentPilotCatalog(catalog, Date.parse("2030-01-01")),
    )
    const id = catalog.places[0]?.id
    if (!id) throw new Error("missing fixture")
    expect(
      (await getDetail(new Request("http://localhost"), { params: Promise.resolve({ id }) }))
        .status,
    ).toBe(404)
    vi.mocked(readPilotCatalog).mockReturnValue(null)
    expect(getList(new Request("http://localhost/api/pilot")).status).toBe(503)
  })
})
