import { parseArgs } from "node:util"

const { values } = parseArgs({
  options: {
    "base-url": { type: "string" },
    "expected-catalog-version": { type: "string" },
  },
  strict: true,
})

if (!values["base-url"] || !values["expected-catalog-version"]) {
  throw new Error("--base-url and --expected-catalog-version are required")
}

const baseUrl = new URL(values["base-url"])
const expectedVersion = values["expected-catalog-version"]
const request = async (path) => {
  const response = await fetch(new URL(path, baseUrl), { redirect: "manual" })
  return { response, text: await response.text() }
}

const root = await request("/")
if (!root.response.ok || !root.text.includes("건강식 지도")) {
  throw new Error(`root smoke failed with ${root.response.status}`)
}

const api = await request("/api/places?limit=1")
if (!api.response.ok) throw new Error(`places API smoke failed with ${api.response.status}`)
const payload = JSON.parse(api.text)
if (payload.catalogVersion !== expectedVersion || !Array.isArray(payload.results)) {
  throw new Error("places API did not return the expected snapshot version")
}

const retired = await request("/pilot")
if (retired.response.status !== 404) {
  throw new Error(`retired /pilot route returned ${retired.response.status}`)
}

console.log(
  JSON.stringify({
    baseUrl: baseUrl.origin,
    catalogVersion: expectedVersion,
    rootStatus: root.response.status,
    apiStatus: api.response.status,
    retiredStatus: retired.response.status,
  }),
)
