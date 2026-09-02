import { PublicCatalogSnapshotSchema } from "../../lib/domain/catalog.ts"

const SMOKE_TIMEOUT_MS = 10_000
const MAX_CATALOG_VERSION_LENGTH = 120
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

function parseCatalogVersion(value, configurationName) {
  const includesControlCharacter =
    typeof value === "string" &&
    [...value].some((character) => {
      const code = character.codePointAt(0)
      return code !== undefined && (code <= 31 || code === 127)
    })
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_CATALOG_VERSION_LENGTH ||
    value.trim() !== value ||
    includesControlCharacter
  ) {
    throw new Error(`Smoke configuration invalid: ${configurationName} must be a catalog version`)
  }
  return value
}

export function parseExpectedCatalogVersion(argumentsList) {
  const versionIndex = argumentsList.indexOf("--expected-catalog-version")
  if (
    versionIndex === -1 ||
    versionIndex !== argumentsList.lastIndexOf("--expected-catalog-version") ||
    versionIndex + 1 >= argumentsList.length
  ) {
    throw new Error("Smoke configuration invalid: --expected-catalog-version is required")
  }
  return parseCatalogVersion(argumentsList[versionIndex + 1], "--expected-catalog-version")
}

export function parseSmokeConfiguration(argumentsList) {
  return {
    baseUrl: parseBaseUrl(argumentsList),
    expectedCatalogVersion: parseExpectedCatalogVersion(argumentsList),
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

export async function runProductionSmoke(baseUrl, requestImplementation = fetch, options) {
  const expectedCatalogVersion = parseCatalogVersion(
    options?.expectedCatalogVersion,
    "expected catalog version",
  )
  const currentDate = options?.currentDate ?? new Date().toISOString().slice(0, 10)
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
  assertProductionCatalog(payload, currentDate, expectedCatalogVersion)

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

function assertProductionCatalog(payload, currentDate, expectedCatalogVersion) {
  let catalog
  try {
    catalog = PublicCatalogSnapshotSchema.parse(payload)
  } catch {
    fail("/api/map-catalog failed the strict catalog contract")
  }
  if (catalog.places.length < 100)
    fail("/api/map-catalog must include at least 100 verified places")
  if (catalog.catalogVersion !== expectedCatalogVersion)
    fail("/api/map-catalog catalog version mismatch")
  const placeIds = new Set(catalog.places.map((place) => place.id))
  if (placeIds.size !== catalog.places.length)
    fail("/api/map-catalog must include unique place IDs")
  const currentMenuPlaceIds = new Set(
    catalog.menus
      .filter(
        (menu) =>
          menu.published && menu.verifiedAt <= currentDate && menu.validUntil >= currentDate,
      )
      .map((menu) => menu.placeId),
  )
  if (!catalog.places.every((place) => place.published && currentMenuPlaceIds.has(place.id)))
    fail(
      "/api/map-catalog requires one current valid published menu per place; menu verification date-validity must include the smoke date",
    )
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const argumentsList = process.argv.slice(2)
    const { baseUrl, expectedCatalogVersion } = parseSmokeConfiguration(argumentsList)
    console.log(await runProductionSmoke(baseUrl, fetch, { expectedCatalogVersion }))
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Production smoke failed")
    process.exitCode = 1
  }
}
