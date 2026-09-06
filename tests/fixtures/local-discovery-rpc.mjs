import { createServer } from "node:http"

const portText = process.env["LOCAL_DISCOVERY_PORT"] ?? ""
if (!/^[1-9]\d{0,4}$/u.test(portText)) throw new Error("LOCAL_DISCOVERY_PORT must be a TCP port")
const port = Number.parseInt(portText, 10)
if (port > 65_535) throw new Error("LOCAL_DISCOVERY_PORT must be a TCP port")

const emptyEpoch = "e".repeat(64)
const state = {
  eligibleEpoch: emptyEpoch,
  evaluatedAt: "2026-09-06T00:00:00.000Z",
  nextBoundary: null,
  releaseId: null,
  schemaVersion: "discovery-serving-1",
}
const stats = { detail: 0, query: 0, state: 0 }
let failState = false

const response = (serverResponse, status, value) => {
  serverResponse.writeHead(status, { "content-type": "application/json" })
  serverResponse.end(JSON.stringify(value))
}

const staleState = (serverResponse) =>
  response(serverResponse, 409, {
    code: "PT409",
    message: JSON.stringify({ error: "stale_state", retry: true }),
  })

const invalidRequest = (serverResponse) =>
  response(serverResponse, 400, {
    code: "PT400",
    message: JSON.stringify({ error: "invalid_request", retry: false }),
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

const matchesState = (request) =>
  request !== null &&
  typeof request === "object" &&
  request.expectedRelease === state.releaseId &&
  request.expectedEpoch === state.eligibleEpoch

const emptyData = (mode) =>
  mode === "regions"
    ? { catalogVersion: state.releaseId ?? "empty", regions: [], total: 0 }
    : {
        catalogVersion: state.releaseId ?? "empty",
        nextCursor: null,
        results: [],
        sortBasis: "catalog_center",
        sortOrigin: null,
        total: 0,
      }

const activate = (value) => {
  if (value === null || typeof value !== "object") return false
  const releaseId = value.releaseId
  const eligibleEpoch = value.eligibleEpoch
  if (typeof releaseId !== "string" || releaseId.length === 0) return false
  if (typeof eligibleEpoch !== "string" || !/^[a-f0-9]{64}$/u.test(eligibleEpoch)) return false
  state.releaseId = releaseId
  state.eligibleEpoch = eligibleEpoch
  state.evaluatedAt = "2026-09-06T00:00:00.000Z"
  state.nextBoundary = null
  return true
}

const server = createServer(async (request, serverResponse) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`)
  if (request.method === "GET" && url.pathname === "/health") {
    response(serverResponse, 200, { ready: true })
    return
  }
  if (request.method === "GET" && url.pathname === "/__test/stats") {
    response(serverResponse, 200, { ...stats })
    return
  }

  const body = await readJson(request)
  if (request.method === "POST" && url.pathname === "/__test/activate") {
    if (!activate(body)) {
      invalidRequest(serverResponse)
      return
    }
    response(serverResponse, 200, { ...state })
    return
  }
  if (request.method === "POST" && url.pathname === "/__test/fail-state") {
    failState = body?.enabled === true
    response(serverResponse, 200, { enabled: failState })
    return
  }
  if (request.method === "POST" && url.pathname === "/__test/set-boundary") {
    if (
      typeof body?.evaluatedAt !== "string" ||
      !(body.nextBoundary === null || typeof body.nextBoundary === "string")
    ) {
      invalidRequest(serverResponse)
      return
    }
    state.evaluatedAt = body.evaluatedAt
    state.nextBoundary = body.nextBoundary
    response(serverResponse, 200, { ...state })
    return
  }

  if (request.method !== "POST") {
    response(serverResponse, 405, { error: "method_not_allowed" })
    return
  }
  if (url.pathname === "/rest/v1/rpc/get_discovery_state") {
    stats.state += 1
    if (failState) {
      response(serverResponse, 503, { error: "fixture_state_failure" })
      return
    }
    if (body === null || typeof body !== "object" || Object.keys(body).length !== 0) {
      invalidRequest(serverResponse)
      return
    }
    response(serverResponse, 200, state)
    return
  }
  if (url.pathname === "/rest/v1/rpc/query_discovery") {
    stats.query += 1
    const query = body?.p_request
    if (!matchesState(query)) {
      staleState(serverResponse)
      return
    }
    if (query.mode !== "places" && query.mode !== "regions") {
      invalidRequest(serverResponse)
      return
    }
    response(serverResponse, 200, { ...state, data: emptyData(query.mode) })
    return
  }
  if (url.pathname === "/rest/v1/rpc/get_discovery_place") {
    stats.detail += 1
    const detail = body?.p_request
    if (!matchesState(detail)) {
      staleState(serverResponse)
      return
    }
    if (typeof detail.id !== "string") {
      invalidRequest(serverResponse)
      return
    }
    response(serverResponse, 200, { ...state, data: null })
    return
  }
  response(serverResponse, 404, { error: "not_found" })
})

const shutdown = () => server.close(() => process.exit(0))
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`READY http://127.0.0.1:${port}\n`)
})
