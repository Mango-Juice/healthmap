import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PilotPlaceDtoSchema, PilotPlacesResponseSchema } from "../../lib/pilot/dto"

vi.mock("../../lib/discovery/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/discovery/server")>()
  return { ...original, getDiscoveryPlace: vi.fn(), queryDiscovery: vi.fn() }
})

import { GET as getDetail } from "../../app/api/places/[id]/route"
import { GET as getList } from "../../app/api/places/route"
import { getDiscoveryPlace, queryDiscovery } from "../../lib/discovery/server"

const store = PilotPlaceDtoSchema.parse({
  id: "bc6b1050-539e-4d28-8493-5920eae54201",
  slug: "synthetic-store",
  name: "합성 테스트 매장",
  brandId: "subway",
  address: "서울 테스트구 1",
  latitude: 37.5,
  longitude: 127,
  region: "서울 테스트구",
  phone: null,
  naverPlaceUrl: null,
  media: [],
  listingKind: "store_only",
  storeDescription: "테스트 전용 매장",
  officialStoreUrl: "https://www.subway.co.kr/storeDetail?franchiseNo=1",
})
const placesResponse = PilotPlacesResponseSchema.parse({
  catalogVersion: "pilot-synthetic",
  sortBasis: "catalog_center",
  sortOrigin: null,
  total: 1,
  results: [{ place: store, menus: [], matchingMenuIds: [] }],
  nextCursor: null,
})
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllEnvs())
describe("place HTTP handlers", () => {
  it("rejects store fields that contradict the listing kind", () => {
    const menuDto = {
      ...store,
      listingKind: "menu_evidence",
      storeDescription: null,
      officialStoreUrl: null,
    } as const

    expect(
      PilotPlaceDtoSchema.safeParse({
        ...store,
        storeDescription: null,
        officialStoreUrl: null,
      }).success,
    ).toBe(false)
    expect(
      PilotPlaceDtoSchema.safeParse({
        ...menuDto,
        storeDescription: store.storeDescription,
        officialStoreUrl: store.officialStoreUrl,
      }).success,
    ).toBe(false)
  })
  it("serves the public DTO without a mode flag or internal evidence", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.mocked(queryDiscovery).mockResolvedValue(placesResponse)
    const response = await getList(new Request("http://localhost/api/places?query=subway&limit=1"))
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('"listingKind":"store_only"')
    expect(body).not.toContain('"evidence"')
    expect(body).not.toContain('"rawText"')
    expect(body).not.toContain('"sourceSha256"')
  })
  it("rejects malformed queries and identifiers before reading data", async () => {
    vi.mocked(queryDiscovery).mockClear()
    expect((await getList(new Request("http://localhost/api/places?limit=1000"))).status).toBe(400)
    expect(
      (
        await getDetail(new Request("http://localhost"), {
          params: Promise.resolve({ id: "invalid" }),
        })
      ).status,
    ).toBe(400)
    expect(queryDiscovery).not.toHaveBeenCalled()
    expect(getDiscoveryPlace).not.toHaveBeenCalled()
  })
  it("serves store-only search and detail without menu evidence", async () => {
    vi.mocked(queryDiscovery).mockResolvedValue(placesResponse)
    vi.mocked(getDiscoveryPlace).mockResolvedValue({
      catalogVersion: placesResponse.catalogVersion,
      place: store,
      menus: [],
    })

    const list = await getList(
      new Request("http://localhost/api/places?filter=salad_poke&query=subway&limit=1"),
    )
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
    const { DiscoveryReadError } = await import("../../lib/discovery/server")
    vi.mocked(queryDiscovery).mockRejectedValue(new DiscoveryReadError("stale_cursor"))

    const response = await getList(
      new Request("http://localhost/api/places?limit=1&cursor=valid_cursor"),
    )

    expect(response.status).toBe(409)
  })
  it("returns 404 for absent detail and 503 for an unavailable reader", async () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.mocked(getDiscoveryPlace).mockResolvedValue(null)
    expect(
      (
        await getDetail(new Request("http://localhost"), {
          params: Promise.resolve({ id: store.id }),
        })
      ).status,
    ).toBe(404)
    const { DiscoveryReadError } = await import("../../lib/discovery/server")
    vi.mocked(queryDiscovery).mockRejectedValue(new DiscoveryReadError("timeout"))
    const unavailable = await getList(new Request("http://localhost/api/places"))
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get("Cache-Control")).toBe("private, no-store")
  })
})
