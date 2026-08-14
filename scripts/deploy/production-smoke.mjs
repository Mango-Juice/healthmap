import { MenuSchema, PlaceSchema } from "../../lib/domain/catalog.ts"

const SMOKE_TIMEOUT_MS = 10_000
const CREDENTIAL_PATTERN =
  /(?:authorization|bearer\s+|service_role|supabase_service_role|sk_(?:live|test)_)/i
const CATALOG_MODES = new Set(["mock", "production"])

function fail(message) {
  throw new Error(`Production smoke failed: ${message}`)
}

export function parseBaseUrl(argumentsList) {
  const baseUrlIndex = argumentsList.indexOf("--base-url")
  if (baseUrlIndex === -1 || baseUrlIndex + 1 >= argumentsList.length) {
    throw new Error("Smoke configuration invalid: --base-url is required")
  }

  try {
    const baseUrl = new URL(argumentsList[baseUrlIndex + 1])
    if (
      !["http:", "https:"].includes(baseUrl.protocol) ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.pathname !== "/" ||
      baseUrl.search ||
      baseUrl.hash
    ) {
      throw new Error("invalid")
    }
    return baseUrl
  } catch {
    throw new Error("Smoke configuration invalid: --base-url must be an http(s) origin")
  }
}

export function parseDataMode(argumentsList) {
  const dataModeIndex = argumentsList.indexOf("--data-mode")
  if (dataModeIndex === -1) return "mock"

  const dataMode = argumentsList[dataModeIndex + 1]
  if (!CATALOG_MODES.has(dataMode)) {
    throw new Error("Smoke configuration invalid: --data-mode must be mock or production")
  }
  return dataMode
}

function assertSafeResponse(response, body, path) {
  if (response.headers.has("set-cookie")) {
    fail(`${path} unexpectedly sets a cookie`)
  }
  if (
    CREDENTIAL_PATTERN.test(body) ||
    [...response.headers].some(([name, value]) => CREDENTIAL_PATTERN.test(`${name}:${value}`))
  ) {
    fail(`${path} exposed a credential-shaped value`)
  }
}

async function request(baseUrl, path, fetchImplementation) {
  let response
  try {
    response = await fetchImplementation(new URL(path, baseUrl), {
      redirect: "error",
      signal: AbortSignal.timeout(SMOKE_TIMEOUT_MS),
    })
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "request timed out"
        : "request failed"
    fail(
      `${path} ${reason}; check the target is reachable and its external credentials or network policy`,
    )
  }

  const body = await response.text()
  if (response.status !== 200) {
    fail(`${path} returned HTTP ${response.status}`)
  }
  assertSafeResponse(response, body, path)
  return { body, response }
}

export async function runProductionSmoke(
  baseUrl,
  expectedDataModeOrFetch = "mock",
  fetchImplementation = fetch,
) {
  const expectedDataMode =
    typeof expectedDataModeOrFetch === "function" ? "mock" : expectedDataModeOrFetch
  const requestImplementation =
    typeof expectedDataModeOrFetch === "function" ? expectedDataModeOrFetch : fetchImplementation
  if (!CATALOG_MODES.has(expectedDataMode)) {
    throw new Error("Smoke configuration invalid: --data-mode must be mock or production")
  }

  const home = await request(baseUrl, "/", requestImplementation)
  if (!home.body.includes("건강식 지도")) {
    fail("/ returned HTTP 200 without the Korean application marker")
  }
  if (expectedDataMode === "mock" && !home.body.includes("샘플 데이터")) {
    fail("/ returned HTTP 200 without the mock sample-data marker")
  }

  const privacy = await request(baseUrl, "/privacy", requestImplementation)
  if (!privacy.body.includes("개인정보 및 분석 안내")) {
    fail("/privacy returned HTTP 200 without its privacy marker")
  }
  if (expectedDataMode === "mock" && !privacy.body.includes("목업 데이터")) {
    fail("/privacy returned HTTP 200 without its mock-data marker")
  }

  const catalog = await request(baseUrl, "/api/map-catalog", requestImplementation)
  if (!catalog.response.headers.get("content-type")?.includes("application/json")) {
    fail("/api/map-catalog did not return JSON")
  }

  let payload
  try {
    payload = JSON.parse(catalog.body)
  } catch {
    fail("/api/map-catalog returned malformed JSON")
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    fail("/api/map-catalog did not return a catalog object")
  const payloadKeys = Object.keys(payload).sort()
  if (payloadKeys.join(",") !== "dataMode,menus,places")
    fail("/api/map-catalog did not return the strict {dataMode, places, menus} contract")
  if (payload.dataMode !== expectedDataMode) {
    fail(`/api/map-catalog dataMode did not match the requested ${expectedDataMode} mode`)
  }
  if (!Array.isArray(payload.places) || !Array.isArray(payload.menus)) {
    fail(`/api/map-catalog did not return the ${expectedDataMode} catalog contract`)
  }
  if (expectedDataMode === "mock") {
    if (payload.places.length !== 5 || payload.menus.length !== 10)
      fail("/api/map-catalog did not return exactly five places and ten menus")
    if (
      !payload.places.every(
        (place) =>
          place.dataMode === "mock" &&
          typeof place.name === "string" &&
          place.name.includes("샘플"),
      ) ||
      !payload.menus.every(
        (menu) =>
          menu.dataMode === "mock" && typeof menu.name === "string" && menu.name.includes("샘플"),
      )
    ) {
      fail("/api/map-catalog records are not explicitly labeled as sample data")
    }
  } else {
    assertProductionCatalog(payload)
  }

  const unsupportedMethod = await requestImplementation(new URL("/api/map-catalog", baseUrl), {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(SMOKE_TIMEOUT_MS),
  })
  const unsupportedBody = await unsupportedMethod.text()
  assertSafeResponse(unsupportedMethod, unsupportedBody, "/api/map-catalog POST")
  if (unsupportedMethod.status !== 405) {
    fail("/api/map-catalog must reject unsupported methods with HTTP 405")
  }

  return "Production smoke passed"
}

function assertProductionCatalog(payload) {
  if (payload.places.length === 0 || payload.menus.length === 0) {
    fail("/api/map-catalog production mode must include published places and menus")
  }

  let places
  let menus
  try {
    places = PlaceSchema.array().parse(payload.places)
    menus = MenuSchema.array().parse(payload.menus)
  } catch {
    fail("/api/map-catalog production records failed canonical public schema validation")
  }
  const placeById = new Map(places.map((place) => [place.id, place]))
  if (
    !places.every((place) => place.dataMode === "production" && place.published) ||
    !menus.every(
      (menu) =>
        menu.dataMode === "production" &&
        menu.published &&
        placeById.get(menu.placeId)?.dataMode === menu.dataMode,
    )
  ) {
    fail("/api/map-catalog production rows are unpublished, orphaned, or mode-mismatched")
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const argumentsList = process.argv.slice(2)
    const baseUrl = parseBaseUrl(argumentsList)
    const dataMode = parseDataMode(argumentsList)
    console.log(await runProductionSmoke(baseUrl, dataMode))
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Production smoke failed")
    process.exitCode = 1
  }
}
