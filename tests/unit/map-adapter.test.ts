import { describe, expect, it } from "vitest"
import { DEFAULT_VIEW } from "../../lib/domain/geo"
import { createNaverMapAdapter, type NaverMapsApi, viewLabel } from "../../lib/map/adapter"

class FakeLatLng {
  constructor(
    readonly latitude: number,
    readonly longitude: number,
  ) {}
}

describe("NAVER map adapter", () => {
  it("constructs, recenters, and destroys through the provider surface", () => {
    const events: string[] = []
    class FakeMap {
      constructor(
        _container: { readonly dataset: DOMStringMap },
        _options: { readonly center: object; readonly zoom: number },
      ) {
        events.push("construct")
      }
      setCenter() {
        events.push("center")
      }
      setZoom() {
        events.push("zoom")
      }
      destroy() {
        events.push("destroy")
      }
    }
    const dataset: DOMStringMap = {}
    const container = { dataset }
    const maps = { LatLng: FakeLatLng, Map: FakeMap } satisfies NaverMapsApi
    const adapter = createNaverMapAdapter(container, DEFAULT_VIEW, maps)
    adapter.recenter({ latitude: 37.5, longitude: 127.03 }, 15)
    adapter.destroy()
    expect(events).toEqual(["construct", "center", "zoom", "destroy"])
    expect(container.dataset["mapConstructed"]).toBeUndefined()
  })

  it("does not expose a constructed state when provider construction fails", () => {
    class BrokenMap {
      constructor() {
        throw new TypeError("provider failed")
      }
      setCenter() {}
      setZoom() {}
    }
    const dataset: DOMStringMap = {}
    const container = { dataset }
    const maps = { LatLng: FakeLatLng, Map: BrokenMap } satisfies NaverMapsApi
    expect(() => createNaverMapAdapter(container, DEFAULT_VIEW, maps)).toThrow("provider failed")
    expect(container.dataset["mapConstructed"]).toBeUndefined()
  })

  it("describes the deterministic fallback view", () => {
    expect(viewLabel(DEFAULT_VIEW)).toBe("37.5007, 127.0328 · 확대 15")
  })
})
