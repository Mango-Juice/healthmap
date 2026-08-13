import { describe, expect, it } from "vitest"
import { DEFAULT_VIEW } from "../../lib/domain/geo"
import { viewLabel } from "../../lib/map/adapter"

describe("map adapter public presentation", () => {
  it("describes the deterministic fallback view", () => {
    expect(viewLabel(DEFAULT_VIEW)).toBe("37.5007, 127.0328 · 확대 15")
  })
})
