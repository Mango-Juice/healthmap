import { afterEach, describe, expect, it, vi } from "vitest"
import { currentPilotCatalog, PilotCatalogSchema } from "../../lib/pilot/catalog"
import { PilotPlacesResponseSchema } from "../../lib/pilot/dto"
import pilotCatalogJson from "../../lib/pilot/pilot-catalog.json"

vi.mock("../../lib/pilot/server", () => ({ readPilotCatalog: vi.fn() }))

import { GET as getDetail } from "../../app/api/places/[id]/route"
import { GET as getList } from "../../app/api/places/route"
import { readPilotCatalog } from "../../lib/pilot/server"

const catalog = PilotCatalogSchema.parse(pilotCatalogJson)
afterEach(() => vi.unstubAllEnvs())
describe("place HTTP handlers", () => {
  it("serves the public DTO without a mode flag or internal evidence", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.mocked(readPilotCatalog).mockReturnValue(catalog)
    const response = getList(new Request("http://localhost/api/places?limit=1"))
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('"total":676')
    expect(body).not.toContain('"evidence"')
    expect(body).not.toContain('"rawText"')
    expect(body).not.toContain('"sourceSha256"')
  })
  it("rejects malformed queries and identifiers before reading data", async () => {
    vi.mocked(readPilotCatalog).mockClear()
    expect(getList(new Request("http://localhost/api/places?limit=1000")).status).toBe(400)
    expect(
      (
        await getDetail(new Request("http://localhost"), {
          params: Promise.resolve({ id: "invalid" }),
        })
      ).status,
    ).toBe(400)
    expect(readPilotCatalog).not.toHaveBeenCalled()
  })
  it("returns conflict when a cursor belongs to different ordering conditions", async () => {
    vi.mocked(readPilotCatalog).mockReturnValue(catalog)
    const first = getList(new Request("http://localhost/api/places?limit=1"))
    const cursor = PilotPlacesResponseSchema.parse(await first.json()).nextCursor

    const response = getList(
      new Request(
        `http://localhost/api/places?limit=1&query=changed&cursor=${encodeURIComponent(cursor ?? "")}`,
      ),
    )

    expect(response.status).toBe(409)
  })
  it("returns 404 for expired detail and 503 for unavailable snapshots", async () => {
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
    expect(getList(new Request("http://localhost/api/places")).status).toBe(503)
  })
})
