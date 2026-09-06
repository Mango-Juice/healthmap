import { describe, expect, it } from "vitest"
import {
  createNaverMapAdapter,
  createSdkLoader,
  type NaverMapsApi,
  type SdkScript,
} from "../../lib/map/adapter"

const TEST_VIEW = { latitude: 37.5007, longitude: 127.0328, zoom: 15 } as const

class FakeLatLng {
  constructor(
    readonly latitude: number,
    readonly longitude: number,
  ) {}
}
class FakeNativeMarker {
  setOptions() {}
  setMap() {}
}
type FakeScript = SdkScript & { dispatch(type: "load" | "error"): void }
const fakeScript = (): FakeScript => {
  const listeners = new Map<string, () => void>()
  return {
    addEventListener: (type, listener) => listeners.set(type, listener),
    async: false,
    dataset: {},
    dispatch: (type) => listeners.get(type)?.(),
    src: "",
    remove() {},
  }
}
const createTeardownFixture = (onRemoveListener?: () => void) => {
  const listenerNames: string[] = []
  const removedListeners: string[] = []
  const lifecycle = { detachedMarkers: 0, destroyedMaps: 0 }
  class FakeMap {
    setCenter() {}
    setZoom() {}
    destroy() {
      lifecycle.destroyedMaps += 1
    }
  }
  class FakeMarker {
    setOptions() {}
    setMap(map: object | null) {
      if (map === null) lifecycle.detachedMarkers += 1
    }
  }
  return {
    lifecycle,
    maps: {
      Event: {
        addListener: (_target: object, eventName: string) => {
          listenerNames.push(eventName)
          return {}
        },
        removeListener: () => {
          const eventName = listenerNames.pop()
          if (eventName !== undefined) removedListeners.push(eventName)
          onRemoveListener?.()
        },
      },
      LatLng: FakeLatLng,
      Map: FakeMap,
      Marker: FakeMarker,
    },
    removedListeners,
  }
}

describe("NAVER map adapter", () => {
  it("deduplicates loading and rejects missing constructors before retry", async () => {
    const scripts: FakeScript[] = []
    let maps: NaverMapsApi | undefined
    const loader = createSdkLoader({
      append: () => undefined,
      createScript: () => {
        const script = fakeScript()
        scripts.push(script)
        return script
      },
      getMaps: () => maps,
      queryScript: () => scripts.at(-1),
    })
    const first = loader.load("client")
    expect(loader.load("client")).toBe(first)
    scripts[0]?.dispatch("load")
    await expect(first).rejects.toThrow("constructor is unavailable")
    const retry = loader.load("client")
    maps = {
      Event: { addListener: () => ({}), removeListener() {} },
      LatLng: FakeLatLng,
      Map: class {
        setCenter() {}
        setZoom() {}
      },
      Marker: FakeNativeMarker,
    } satisfies NaverMapsApi
    scripts[1]?.dispatch("load")
    await expect(retry).resolves.toBeUndefined()
  })

  it("rejects script errors and cancellation prevents late completion", async () => {
    const scripts: FakeScript[] = []
    const loader = createSdkLoader({
      append: () => undefined,
      createScript: () => {
        const script = fakeScript()
        scripts.push(script)
        return script
      },
      getMaps: () => undefined,
      queryScript: () => scripts.at(-1),
    })
    const failed = loader.load("client")
    scripts[0]?.dispatch("error")
    await expect(failed).rejects.toThrow("failed to load")
    const cancelled = loader.load("client")
    loader.cancel()
    scripts[1]?.dispatch("load")
    let settled = false
    cancelled.finally(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
  })
  it("constructs, describes, recenters, and destroys through the provider surface", () => {
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
    const maps = {
      Event: { addListener: () => ({}), removeListener() {} },
      LatLng: FakeLatLng,
      Map: FakeMap,
      Marker: FakeNativeMarker,
    } satisfies NaverMapsApi
    const adapter = createNaverMapAdapter(container, TEST_VIEW, maps)
    adapter.recenter({ latitude: 37.5, longitude: 127.03 }, 15)
    adapter.destroy()
    expect(events).toEqual(["construct", "center", "zoom", "destroy"])
    expect(container.dataset["mapConstructed"]).toBeUndefined()
  })

  it("removes normal native listeners and detaches markers during teardown", () => {
    const fixture = createTeardownFixture()
    const adapter = createNaverMapAdapter({ dataset: {} }, TEST_VIEW, fixture.maps)

    adapter.syncMarkers([
      {
        id: "place-1",
        label: "실제 장소",
        latitude: 37.5042,
        longitude: 127.0411,
        onSelect: () => undefined,
      },
    ])
    adapter.destroy()

    expect(fixture.removedListeners).toEqual(["click", "tilesloaded", "idle"])
    expect(fixture.lifecycle.detachedMarkers).toBe(1)
    expect(fixture.lifecycle.destroyedMaps).toBe(1)
  })

  it("detaches markers without native listener removal after provider authorization invalidates them", () => {
    const fixture = createTeardownFixture(() => {
      throw new TypeError("Cannot read properties of null (reading 'isArray')")
    })
    const adapter = createNaverMapAdapter({ dataset: {} }, TEST_VIEW, fixture.maps)

    adapter.syncMarkers([
      {
        id: "place-1",
        label: "실제 장소",
        latitude: 37.5042,
        longitude: 127.0411,
        onSelect: () => undefined,
      },
    ])
    adapter.teardownAfterProviderFailure()
    adapter.teardownAfterProviderFailure()

    expect(fixture.removedListeners).toEqual([])
    expect(fixture.lifecycle.detachedMarkers).toBe(1)
    expect(fixture.lifecycle.destroyedMaps).toBe(1)
  })

  it("places catalog entries at their real coordinates with NAVER markers", () => {
    const markerEvents: string[] = []
    const listeners: Array<() => void> = []
    class FakeMap {
      setCenter() {}
      setZoom() {}
    }
    class FakeMarker {
      setOptions() {}
      constructor(options: ConstructorParameters<NaverMapsApi["Marker"]>[0]) {
        if (!(options.position instanceof FakeLatLng)) throw new TypeError("unexpected position")
        markerEvents.push(
          `create:${options.title}:${options.position.latitude}:${options.position.longitude}`,
        )
        markerEvents.push(`icon:${options.icon}`)
        markerEvents.push(`z-index:${options.zIndex}`)
      }
      setMap(map: object | null) {
        if (map === null) markerEvents.push("remove")
      }
    }
    const maps = {
      Event: {
        addListener: (_target: object, eventName: string, listener: () => void) => {
          if (eventName === "click") listeners.push(listener)
          return {}
        },
        removeListener: () => markerEvents.push("unlisten"),
      },
      LatLng: FakeLatLng,
      Map: FakeMap,
      Marker: FakeMarker,
    } satisfies NaverMapsApi
    const adapter = createNaverMapAdapter({ dataset: {} }, TEST_VIEW, maps)
    let selected = ""

    adapter.syncMarkers([
      {
        id: "place-1",
        label: "실제 장소",
        iconUrl: "/markers/marker-plant.svg",
        latitude: 37.5042,
        longitude: 127.0411,
        zIndex: 1000,
        onSelect: () => {
          selected = "place-1"
        },
      },
    ])
    listeners[0]?.()
    adapter.syncMarkers([])

    expect(markerEvents).toContain("create:실제 장소:37.5042:127.0411")
    expect(markerEvents).toContain("icon:/markers/marker-plant.svg")
    expect(markerEvents).toContain("z-index:1000")
    expect(selected).toBe("place-1")
    expect(markerEvents).toContain("remove")
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
    const maps = {
      Event: { addListener: () => ({}), removeListener() {} },
      LatLng: FakeLatLng,
      Map: BrokenMap,
      Marker: FakeNativeMarker,
    } satisfies NaverMapsApi
    expect(() => createNaverMapAdapter(container, TEST_VIEW, maps)).toThrow("provider failed")
    expect(container.dataset["mapConstructed"]).toBeUndefined()
  })
})
