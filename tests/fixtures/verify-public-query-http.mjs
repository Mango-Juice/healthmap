import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"

const base = "http://127.0.0.1:4529"
const evidence = ".omo/evidence/task7-query/"
const regions = JSON.parse(await readFile(`${evidence}http-regions.json`, "utf8"))
const page = JSON.parse(await readFile(`${evidence}http-page.json`, "utf8"))
const detail = JSON.parse(await readFile(`${evidence}http-detail.json`, "utf8"))
const root = await readFile(`${evidence}http-root.html`, "utf8")
const place = await readFile(`${evidence}http-place.html`, "utf8")
assert.equal(regions.total, 55)
assert.equal(regions.places.length, 0)
assert.equal(regions.menus.length, 0)
assert.equal(regions.regions[0].count, 55)
assert.equal(page.total, 55)
assert.equal(page.places.length, 1)
assert.equal(page.menus.length, 1)
assert.equal(detail.place.slug, "public-v2-test-0")
assert.equal(detail.menus.length, 1)
assert.equal(root.includes("public-v2-test-"), false)
assert.equal(place.includes("public-v2-test-0"), true)
assert.equal(place.includes("public-v2-test-1"), false)
const next = await fetch(
  `${base}/api/map-catalog/query?limit=1&ingredient=fish&cooking=grilled&cursor=${page.nextCursor}`,
)
const nextPage = await next.json()
assert.equal(next.status, 200)
assert.notEqual(nextPage.places[0].id, page.places[0].id)
await writeFile(`${evidence}http-next-page.json`, JSON.stringify(nextPage))
const impossible = await fetch(`${base}/api/map-catalog/query?ingredient=fish&cooking=steamed`)
const zero = await impossible.json()
assert.equal(zero.total, 0)
assert.equal(zero.places.length, 0)
await writeFile(`${evidence}http-same-menu-empty.json`, JSON.stringify(zero))
for (const query of ["limit=51", "south=1", "query=a&query=b", "cursor=malformed"]) {
  const response = await fetch(`${base}/api/map-catalog/query?${query}`)
  assert.equal(response.status, 400)
}
await writeFile(
  `${evidence}http-proof.json`,
  JSON.stringify(
    {
      status: "PASS",
      fixture: "explicit synthetic typed v2; no production approval or promotion",
      base,
      aggregateTotal: 55,
      rootHasPlaceRows: false,
      detailPlaceCount: 1,
      queryPageCount: 1,
      sameMenuEmpty: true,
      malformedStatus: 400,
    },
    null,
    2,
  ),
)
console.log(
  "PASS: actual Next HTTP/RSC bounded bootstrap, detail, pagination, same-menu filtering, malformed requests",
)
