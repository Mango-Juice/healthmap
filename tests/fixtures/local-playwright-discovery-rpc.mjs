import { readFile } from "node:fs/promises"
import { createServer } from "node:https"

const portText = process.env["LOCAL_DISCOVERY_PORT"] ?? ""
if (!/^[1-9]\d{0,4}$/u.test(portText)) throw new Error("LOCAL_DISCOVERY_PORT must be a TCP port")
const port = Number.parseInt(portText, 10)
if (port > 65_535) throw new Error("LOCAL_DISCOVERY_PORT must be a TCP port")

const eligibleEpoch = "d".repeat(64)
const catalogVersion = "e2e-playwright-current"
const places = [
  [
    "6dd657be-fc3b-4bb8-8e67-fabbee0f2ea0",
    "test-sprout-square",
    "새싹 네모식당",
    37.5707,
    126.9788,
  ],
  [
    "970347d1-7b9f-4b7d-8cd9-3674148c0e83",
    "test-rainbow-bowl",
    "무지개 한그릇 연구소",
    37.5678,
    126.9775,
  ],
  [
    "17d03b81-1376-42ad-8031-14b559f3c075",
    "test-balance-lab",
    "균형 실험실 식탁",
    37.5741,
    126.9812,
  ],
  [
    "55005f59-f094-4b30-8e8a-447b1607da3f",
    "test-leaf-table",
    "잎사귀 가상 테이블",
    37.5635,
    126.9841,
  ],
  [
    "d5e59fb4-ca69-4958-866e-5930163aad0d",
    "test-cloud-canteen",
    "구름 도시락 공방",
    37.5779,
    126.9724,
  ],
].map(([id, slug, name, latitude, longitude], index) => ({
  address: `서울 강남구 테스트로 ${index + 1}`,
  brandId: null,
  id,
  latitude,
  listingKind: "menu_evidence",
  longitude,
  media: [],
  name,
  naverPlaceUrl: `https://map.naver.com/p/entry/place/${index + 1}`,
  officialStoreUrl: null,
  phone: null,
  region: "서울 강남구",
  slug,
  storeDescription: null,
}))
const menuData = [
  ["bc6b1050-539e-4d28-8493-5920eae54248", 0, "초록 그릇", "salad_poke", "brown_rice", "unknown"],
  [
    "bede62e8-6e4d-4d3b-8227-34b73451b3a4",
    0,
    "콩 곡물 접시",
    "salad_poke",
    "unknown",
    "source_vegan_label",
  ],
  [
    "c4e1cffb-2658-4ad4-8e38-c8c12a11c627",
    1,
    "구운콩 단백 그릇",
    "main_dish",
    "brown_rice",
    "unknown",
  ],
  [
    "75708968-2839-4eba-8b44-f613de821d6c",
    1,
    "두부 곡물 그릇",
    "main_dish",
    "unknown",
    "source_vegan_label",
  ],
  [
    "4ebaeeac-274e-494f-84ad-6ce34a48b6f5",
    2,
    "세 가지 균형 접시",
    "salad_poke",
    "brown_rice",
    "unknown",
  ],
  [
    "e68ddcb7-30bb-4e00-811c-b47303a73957",
    2,
    "현미 채소 컵",
    "salad_poke",
    "brown_rice",
    "unknown",
  ],
  [
    "ec13e8ec-df3f-4fbc-83f3-fa2f93d31ccc",
    3,
    "잎채소 콩밥",
    "salad_poke",
    "unknown",
    "source_vegan_label",
  ],
  [
    "9b36dc90-c43e-47e8-89b3-d077ebc7fcd1",
    3,
    "버섯 두부 접시",
    "main_dish",
    "unknown",
    "source_vegan_label",
  ],
  [
    "f1fb182b-f9d3-4a81-81ba-edeb24514058",
    4,
    "구름 채소 도시락",
    "salad_poke",
    "brown_rice",
    "unknown",
  ],
  [
    "e240fdb1-ff22-42d6-8473-6f311846f943",
    4,
    "단백 콩 도시락",
    "main_dish",
    "unknown",
    "source_vegan_label",
  ],
  ["10000000-0000-4000-8000-000000000011", 0, "일반 확인 메뉴", "noodles", "unknown", "unknown"],
]
const unselectedMenuIds = new Set(["10000000-0000-4000-8000-000000000011"])
const menus = menuData.map(([id, placeIndex, name, form, riceBase, dietary]) => {
  const selectionReasons = [
    ...(form === "salad_poke" ? [{ basis: "menu_name", kind: "salad_poke", text: name }] : []),
    ...(riceBase !== "unknown" ? [{ basis: "menu_name", kind: "whole_grain", text: name }] : []),
    ...(dietary !== "unknown" ? [{ basis: "menu_name", kind: "dietary_meal", text: name }] : []),
  ]
  return {
    applicabilityNotice: null,
    branchApplicability: "branch_confirmed",
    facts: {
      base_is_option: false,
      cooking: [],
      dietary,
      form,
      ingredients: id === "bc6b1050-539e-4d28-8493-5920eae54248" ? ["fish"] : [],
      ordering_note: riceBase === "unknown" ? null : "합성 곡물밥",
      rice_base: riceBase,
      scope: "meal",
      selection_reasons: selectionReasons,
    },
    id,
    name,
    placeId: places[placeIndex].id,
  }
})
const state = {
  eligibleEpoch,
  evaluatedAt: "2026-09-06T00:00:00.000Z",
  nextBoundary: null,
  releaseId: catalogVersion,
  schemaVersion: "discovery-serving-1",
}

const respond = (response, status, value) => {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(value))
}
const invalidRequest = (response) =>
  respond(response, 400, {
    code: "PT400",
    message: JSON.stringify({ error: "invalid_request", retry: false }),
  })
const staleState = (response) =>
  respond(response, 409, {
    code: "PT409",
    message: JSON.stringify({ error: "stale_state", retry: true }),
  })
const staleCursor = (response) =>
  respond(response, 409, {
    code: "PT409",
    message: JSON.stringify({ error: "stale_cursor", retry: true }),
  })
const readJson = async (request) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    return null
  }
}
const hasExpectedState = (value) =>
  value !== null &&
  typeof value === "object" &&
  value.expectedEpoch === state.eligibleEpoch &&
  value.expectedRelease === state.releaseId
const matchesFilter = (menu, filter) =>
  filter === "all" ||
  (filter === "salad_poke" && menu.facts.form === "salad_poke") ||
  (filter === "whole_grain" && menu.facts.rice_base !== "unknown") ||
  (filter === "plant_based" && menu.facts.dietary !== "unknown") ||
  (filter === "rice" && menu.facts.form === "rice") ||
  (filter === "grilled_steamed" && menu.facts.cooking.length > 0)
const inBounds = (place, query) =>
  query.south === undefined ||
  (place.latitude >= query.south &&
    place.latitude <= query.north &&
    place.longitude >= query.west &&
    place.longitude <= query.east)
const queryCatalog = (query) => {
  if (query.mode !== "places" && query.mode !== "regions") return null
  if (query.cursor !== undefined) return "stale_cursor"
  if (
    typeof query.query !== "string" ||
    typeof query.filter !== "string" ||
    typeof query.limit !== "number"
  )
    return null
  const tokens = query.query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
  const results = places.flatMap((place) => {
    if ((query.region !== undefined && query.region !== place.region) || !inBounds(place, query))
      return []
    const matchingMenus = menus.filter(
      (menu) =>
        menu.placeId === place.id &&
        !unselectedMenuIds.has(menu.id) &&
        matchesFilter(menu, query.filter) &&
        (query.ingredient === "all" || menu.facts.ingredients.includes(query.ingredient)),
    )
    const searchable = [place.name, place.address, ...matchingMenus.map((menu) => menu.name)]
      .join(" ")
      .toLowerCase()
    return matchingMenus.length > 0 && tokens.every((token) => searchable.includes(token))
      ? [{ matchingMenuIds: matchingMenus.map((menu) => menu.id), menus: matchingMenus, place }]
      : []
  })
  if (query.mode === "regions") {
    return {
      catalogVersion,
      regions:
        results.length === 0
          ? []
          : [
              {
                id: "서울 강남구",
                label: "서울 강남구",
                count: results.length,
                bounds: {
                  southWest: { latitude: 37.5635, longitude: 126.9724 },
                  northEast: { latitude: 37.5779, longitude: 126.9841 },
                },
              },
            ],
      total: results.length,
    }
  }
  return {
    catalogVersion,
    nextCursor: null,
    results: results.slice(0, query.limit),
    sortBasis:
      query.region === undefined && query.south === undefined
        ? "catalog_center"
        : query.region !== undefined
          ? "region_center"
          : "map_center",
    sortOrigin: results.length === 0 ? null : { latitude: 37.5707, longitude: 126.979 },
    total: results.length,
  }
}

const server = createServer(
  {
    cert: await readFile(new URL("./local-catalog-certificate.pem", import.meta.url)),
    key: await readFile(new URL("./local-catalog-key.pem", import.meta.url)),
  },
  async (request, response) => {
    const url = new URL(request.url ?? "/", `https://127.0.0.1:${port}`)
    if (request.method === "GET" && url.pathname === "/health") {
      respond(response, 200, { ready: true })
      return
    }
    if (request.method !== "POST") {
      respond(response, 405, { error: "method_not_allowed" })
      return
    }
    const body = await readJson(request)
    if (url.pathname === "/rest/v1/rpc/get_discovery_state") {
      if (body === null || typeof body !== "object" || Object.keys(body).length !== 0)
        invalidRequest(response)
      else respond(response, 200, state)
      return
    }
    const requestBody = body?.p_request
    if (!hasExpectedState(requestBody)) {
      staleState(response)
      return
    }
    if (url.pathname === "/rest/v1/rpc/query_discovery") {
      const result = queryCatalog(requestBody)
      if (result === "stale_cursor") staleCursor(response)
      else if (result === null) invalidRequest(response)
      else respond(response, 200, { ...state, data: result })
      return
    }
    if (url.pathname === "/rest/v1/rpc/get_discovery_place") {
      if (typeof requestBody.id !== "string") invalidRequest(response)
      else {
        const place = places.find((entry) => entry.id === requestBody.id)
        respond(response, 200, {
          ...state,
          data:
            place === undefined
              ? null
              : {
                  catalogVersion,
                  menus: menus.filter(
                    (menu) => menu.placeId === place.id && !unselectedMenuIds.has(menu.id),
                  ),
                  place,
                },
        })
      }
      return
    }
    respond(response, 404, { error: "not_found" })
  },
)

const shutdown = () => server.close(() => process.exit(0))
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
server.listen(port, "127.0.0.1")
