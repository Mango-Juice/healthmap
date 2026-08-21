import { MenuSchema, PlaceSchema } from "../../lib/domain/catalog.ts"

const SMOKE_TIMEOUT_MS = 10_000
const CREDENTIAL_PATTERN =
  /(?:authorization|bearer\s+|service_role|supabase_service_role|sk_(?:live|test)_)/i

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

export async function runProductionSmoke(baseUrl, requestImplementation = fetch) {
  const home = await request(baseUrl, "/", requestImplementation)
  if (!home.body.includes("건강식 지도")) {
    fail("/ returned HTTP 200 without the Korean application marker")
  }

  const privacy = await request(baseUrl, "/privacy", requestImplementation)
  if (!privacy.body.includes("개인정보 및 분석 안내")) {
    fail("/privacy returned HTTP 200 without its privacy marker")
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
  if (payload.dataMode !== "production") {
    fail("/api/map-catalog dataMode must be production")
  }
  if (!Array.isArray(payload.places) || !Array.isArray(payload.menus)) {
    fail("/api/map-catalog did not return the production catalog contract")
  }
  assertProductionCatalog(payload)

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
    console.log(await runProductionSmoke(baseUrl))
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Production smoke failed")
    process.exitCode = 1
  }
}
