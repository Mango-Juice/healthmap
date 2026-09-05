import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { currentPilotCatalog, PilotCatalogSchema } from "../../lib/pilot/catalog"
import { PilotPlaceDtoSchema, PilotPlacesResponseSchema } from "../../lib/pilot/dto"
import pilotCatalogJson from "../../lib/pilot/pilot-catalog.json"
import { toPilotPlaceDto, toSubwayStoreDto } from "../../lib/pilot/projection"
import { SubwayStoreSnapshotSchema } from "../../lib/pilot/subway"
import subwayStoresJson from "../../lib/pilot/subway-stores.json"

vi.mock("../../lib/pilot/server", () => ({
  readPilotCatalog: vi.fn(),
  readSubwayStoreCatalog: vi.fn(),
}))

import { GET as getDetail } from "../../app/api/places/[id]/route"
import { GET as getList } from "../../app/api/places/route"
import { readPilotCatalog, readSubwayStoreCatalog } from "../../lib/pilot/server"
import { toSubwayStoreCatalog } from "../../lib/pilot/subway"

const catalog = PilotCatalogSchema.parse(pilotCatalogJson)
const subway = toSubwayStoreCatalog(SubwayStoreSnapshotSchema.parse(subwayStoresJson))
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllEnvs())
describe("place HTTP handlers", () => {
  it("rejects store fields that contradict the listing kind", () => {
    const place = catalog.places[0]
    const store = subway.stores[0]
    if (!place || !store) throw new Error("missing place DTO fixtures")
    const menuDto = toPilotPlaceDto(place)
    const storeDto = toSubwayStoreDto(store)

    expect(
      PilotPlaceDtoSchema.safeParse({
        ...storeDto,
        storeDescription: null,
        officialStoreUrl: null,
      }).success,
    ).toBe(false)
    expect(
      PilotPlaceDtoSchema.safeParse({
        ...menuDto,
        storeDescription: storeDto.storeDescription,
        officialStoreUrl: storeDto.officialStoreUrl,
      }).success,
    ).toBe(false)
  })
  it("serves the public DTO without a mode flag or internal evidence", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.mocked(readPilotCatalog).mockReturnValue(catalog)
    vi.mocked(readSubwayStoreCatalog).mockReturnValue(subway)
    const response = getList(new Request("http://localhost/api/places?query=subway&limit=1"))
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('"listingKind":"store_only"')
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
    expect(readSubwayStoreCatalog).not.toHaveBeenCalled()
  })
  it("serves store-only search and detail without menu evidence", async () => {
    vi.mocked(readPilotCatalog).mockReturnValue(catalog)
    vi.mocked(readSubwayStoreCatalog).mockReturnValue(subway)
    const store = subway.stores[0]
    if (!store) throw new Error("missing Subway fixture")

    const list = getList(new Request("http://localhost/api/places?query=subway&limit=1"))
    const detail = await getDetail(new Request("http://localhost"), {
      params: Promise.resolve({ id: store.id }),
    })

    expect(list.status).toBe(200)
    expect(PilotPlacesResponseSchema.parse(await list.json()).results[0]).toMatchObject({
      place: { listingKind: "store_only" },
      menus: [],
      matchingMenuIds: [],
    })
    expect(detail.status).toBe(200)
    expect(await detail.json()).toMatchObject({
      place: { id: store.id, listingKind: "store_only" },
      menus: [],
    })
  })
  it("returns conflict when a cursor belongs to different ordering conditions", async () => {
    vi.mocked(readPilotCatalog).mockReturnValue(catalog)
    vi.mocked(readSubwayStoreCatalog).mockReturnValue(subway)
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
    vi.mocked(readSubwayStoreCatalog).mockReturnValue(subway)
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
