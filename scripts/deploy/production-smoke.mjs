const SMOKE_TIMEOUT_MS = 10_000
const PUBLIC_DISCOVERY_QUERY =
  "mode=places&filter=all&ingredient=all&limit=50&south=37.4&west=126.8&north=37.7&east=127.2"
const CREDENTIAL_PATTERN =
  /(?:authorization|bearer\s+|service_role|supabase_service_role|sk_(?:live|test)_)/i

function fail(message) {
  throw new Error(`Production smoke failed: ${message}`)
}

export function parseBaseUrl(argumentsList) {
  if (argumentsList.length !== 2 || argumentsList[0] !== "--base-url") {
    throw new Error("Smoke configuration invalid: --base-url is required")
  }

  try {
    const baseUrl = new URL(argumentsList[1])
    if (
      !["http:", "https:"].includes(baseUrl.protocol) ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.pathname !== "/" ||
      baseUrl.search ||
      baseUrl.hash
    )
      throw new Error("invalid")
    return baseUrl
  } catch {
    throw new Error("Smoke configuration invalid: --base-url must be an http(s) origin")
  }
}

function assertSafeResponse(response, body, path) {
  if (response.headers.has("set-cookie")) fail(`${path} unexpectedly sets a cookie`)
  if (
    CREDENTIAL_PATTERN.test(body) ||
    [...response.headers].some(([name, value]) => CREDENTIAL_PATTERN.test(`${name}:${value}`))
  )
    fail(`${path} exposed a credential-shaped value`)
}

async function request(baseUrl, path, fetchImplementation) {
  let response
  try {
    response = await fetchImplementation(new URL(path, baseUrl), {
      redirect: "error",
      signal: AbortSignal.timeout(SMOKE_TIMEOUT_MS),
    })
  } catch {
    fail(`${path} request failed`)
  }
  const body = await response.text()
  assertSafeResponse(response, body, path)
  return { body, response }
}

export async function runProductionSmoke(baseUrl, fetchImplementation = fetch) {
  const home = await request(baseUrl, "/", fetchImplementation)
  if (home.response.status !== 200 || !home.body.includes("건강식 지도"))
    fail("/ did not return the application marker")
  const privacy = await request(baseUrl, "/privacy", fetchImplementation)
  if (privacy.response.status !== 200 || !privacy.body.includes("개인정보 및 분석 안내"))
    fail("/privacy did not return the privacy marker")
  const places = await request(
    baseUrl,
    `/api/places?${PUBLIC_DISCOVERY_QUERY}`,
    fetchImplementation,
  )
  if (
    places.response.status !== 200 ||
    !places.response.headers.get("content-type")?.includes("application/json")
  )
    fail("/api/places did not return JSON")
  let payload
  try {
    payload = JSON.parse(places.body)
  } catch {
    fail("/api/places returned malformed JSON")
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    !Array.isArray(payload.results) ||
    !Number.isInteger(payload.total) ||
    payload.total < 0 ||
    !(payload.nextCursor === null || typeof payload.nextCursor === "string")
  )
    fail("/api/places did not return the public discovery response")
  const malformed = await request(
    baseUrl,
    `/api/places?${PUBLIC_DISCOVERY_QUERY.replace("limit=50", "limit=0")}`,
    fetchImplementation,
  )
  if (malformed.response.status !== 400) fail("/api/places must reject limit=0 with HTTP 400")
  try {
    const error = JSON.parse(malformed.body)
    if (error.error !== "invalid_request" || error.retry !== false)
      fail("/api/places malformed-input response is invalid")
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Production smoke failed:")) throw error
    fail("/api/places malformed-input response is not JSON")
  }
  return "Production smoke passed"
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    console.log(await runProductionSmoke(parseBaseUrl(process.argv.slice(2))))
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Production smoke failed")
    process.exitCode = 1
  }
}
