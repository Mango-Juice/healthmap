const uuidFor = (prefix, index) =>
  `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, "0")}`

export const createProductionCatalog = ({ count = 100, validUntil = "2026-11-19" } = {}) => ({
  catalogVersion: "catalog-2026-08-22",
  dataMode: "production",
  places: Array.from({ length: count }, (_, index) => ({
    dataMode: "production",
    id: uuidFor("0", index + 1),
    slug: `production-place-${index + 1}`,
    name: `Production place ${index + 1}`,
    address: `Fixture address ${index + 1}`,
    latitude: 37.5,
    longitude: 127.03,
    naverPlaceUrl: `https://map.naver.com/p/place/${index + 1}`,
    primaryTag: "balanced",
    healthTags: ["balanced"],
    published: true,
  })),
  menus: Array.from({ length: count }, (_, index) => ({
    dataMode: "production",
    id: uuidFor("1", index + 1),
    placeId: uuidFor("0", index + 1),
    name: `Production menu ${index + 1}`,
    healthTags: ["balanced"],
    evidenceUrl: null,
    verificationMethod: "direct_confirmation",
    verifiedAt: "2026-08-21",
    validUntil,
    displayOrder: 0,
    published: true,
  })),
})

export const createProductionFetch = (catalog) => (input, init) => {
  const url = new URL(input)
  if (url.pathname === "/" && init?.method !== "POST")
    return Promise.resolve(new Response("<main>건강식 지도</main>", { status: 200 }))
  if (url.pathname === "/privacy" && init?.method !== "POST")
    return Promise.resolve(new Response("개인정보 및 분석 안내", { status: 200 }))
  if (url.pathname === "/api/map-catalog" && init?.method === "POST")
    return Promise.resolve(new Response("", { status: 405 }))
  if (url.pathname === "/api/map-catalog")
    return Promise.resolve(
      new Response(JSON.stringify(catalog), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    )
  return Promise.resolve(new Response("not found", { status: 404 }))
}
