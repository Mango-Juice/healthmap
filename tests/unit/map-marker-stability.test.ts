import { describe, expect, it, vi } from "vitest"
import { createNaverMapAdapter, type NaverMapsApi } from "../../lib/map/adapter"

const TEST_VIEW = { latitude: 37.5007, longitude: 127.0328, zoom: 15 } as const

describe("native marker identity", () => {
  it("keeps pins and click listeners while selection, order, and place details change", () => {
    const created: NativeMarker[] = []
    const clicks: Array<() => void> = []
    class NativeMarker {
      constructor() {
        created.push(this)
      }
      setMap = vi.fn()
      setOptions = vi.fn()
    }
    const removeListener = vi.fn()
    const maps = {
      LatLng: class {
        constructor(
          readonly lat: number,
          readonly lng: number,
        ) {}
      },
      Map: class {
        setCenter() {}
        setZoom() {}
      },
      Marker: NativeMarker,
      Event: {
        addListener: (_target: object, name: string, callback: () => void) => {
          if (name === "click") clicks.push(callback)
          return {}
        },
        removeListener,
      },
    } satisfies NaverMapsApi
    const adapter = createNaverMapAdapter({ dataset: {} }, TEST_VIEW, maps)
    const initialClick = vi.fn()
    const nextClick = vi.fn()
    const a = {
      id: "a",
      label: "같은 상호",
      latitude: 37.5,
      longitude: 127.0,
      iconUrl: "/pin.svg",
      onSelect: initialClick,
    }
    const b = { ...a, id: "b" }
    adapter.syncMarkers([a, b])
    const [first, second] = created

    adapter.syncMarkers([b, { ...a, iconUrl: "/selected.svg", zIndex: 1000, onSelect: nextClick }])

    expect(created).toHaveLength(2)
    expect(first?.setMap).not.toHaveBeenCalled()
    expect(second?.setMap).not.toHaveBeenCalled()
    expect(second?.setOptions).not.toHaveBeenCalled()
    expect(first?.setOptions).toHaveBeenLastCalledWith({ icon: "/selected.svg", zIndex: 1000 })
    expect(clicks).toHaveLength(2)
    clicks[0]?.()
    expect(nextClick).toHaveBeenCalledOnce()
    expect(initialClick).not.toHaveBeenCalled()
    adapter.syncMarkers([{ ...a, label: "새 이름", latitude: 37.6 }, b])
    expect(created).toHaveLength(2)
    expect(first?.setOptions).toHaveBeenLastCalledWith({
      icon: "/pin.svg",
      zIndex: 0,
      title: "새 이름",
      position: new maps.LatLng(37.6, 127.0),
    })
    adapter.syncMarkers([b])
    expect(first?.setMap).toHaveBeenCalledExactlyOnceWith(null)
    expect(second?.setMap).not.toHaveBeenCalled()
    expect(removeListener).toHaveBeenCalledOnce()
    adapter.destroy()
    expect(second?.setMap).toHaveBeenCalledExactlyOnceWith(null)
  })
})
