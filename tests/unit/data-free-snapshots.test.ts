import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const productionSnapshots = [
  "lib/pilot/pilot-catalog.json",
  "lib/pilot/subway-stores.json",
] as const

describe("data-free source boundary", () => {
  it("Given the public checkout, when its retired snapshot paths are inspected, then neither production snapshot is present", async () => {
    await Promise.all(
      productionSnapshots.map((path) => expect(access(path, constants.F_OK)).rejects.toBeDefined()),
    )
  })
})
