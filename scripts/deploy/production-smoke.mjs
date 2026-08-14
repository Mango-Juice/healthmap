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

export async function runProductionSmoke(baseUrl, fetchImplementation = fetch) {
  const home = await request(baseUrl, "/", fetchImplementation)
  if (!home.body.includes("건강식 지도") || !home.body.includes("샘플 데이터")) {
    fail("/ returned HTTP 200 without the Korean application and sample-data markers")
  }

  const privacy = await request(baseUrl, "/privacy", fetchImplementation)
  if (!privacy.body.includes("개인정보 및 분석 안내") || !privacy.body.includes("목업 데이터")) {
    fail("/privacy returned HTTP 200 without its privacy and mock-data markers")
  }

  const catalog = await request(baseUrl, "/api/map-catalog", fetchImplementation)
  if (!catalog.response.headers.get("content-type")?.includes("application/json")) {
    fail("/api/map-catalog did not return JSON")
  }

  let payload
  try {
    payload = JSON.parse(catalog.body)
  } catch {
    fail("/api/map-catalog returned malformed JSON")
  }
  if (!Array.isArray(payload?.places) || payload.places.length !== 5) {
    fail("/api/map-catalog did not return exactly five mock catalog records")
  }
  const menuCount = payload.places.reduce(
    (count, place) => count + (Array.isArray(place.menus) ? place.menus.length : 0),
    0,
  )
  if (payload.data_mode !== "mock" || menuCount !== 10) {
    fail("/api/map-catalog did not return the five-place ten-menu mock catalog")
  }
  if (
    !payload.places.every((place) => typeof place.name === "string" && place.name.includes("샘플"))
  ) {
    fail("/api/map-catalog records are not explicitly labeled as sample data")
  }

  const unsupportedMethod = await fetchImplementation(new URL("/api/map-catalog", baseUrl), {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(SMOKE_TIMEOUT_MS),
  })
  if (unsupportedMethod.status !== 405) {
    fail("/api/map-catalog must reject unsupported methods with HTTP 405")
  }

  return "Production smoke passed"
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const baseUrl = parseBaseUrl(process.argv.slice(2))
    console.log(await runProductionSmoke(baseUrl))
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Production smoke failed")
    process.exitCode = 1
  }
}
