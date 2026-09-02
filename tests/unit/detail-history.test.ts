import { afterEach, describe, expect, it } from "vitest"

import {
  type HistorySnapshot,
  readMapSnapshot,
  storeMapSnapshot,
} from "../../components/map/detail-history"

const snapshot = {
  appliedBounds: {
    northEast: { latitude: 37.51, longitude: 127.04 },
    southWest: { latitude: 37.49, longitude: 127.02 },
  },
  filter: "vegetables",
  query: "새싹",
  trayExpanded: true,
  url: "/",
  view: { latitude: 37.5, longitude: 127.03, zoom: 15 },
} satisfies HistorySnapshot

const setSessionStorage = (storage: Pick<Storage, "getItem" | "removeItem" | "setItem">): void => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: storage },
  })
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window")
})

describe("detail history storage", () => {
  it.each(["getItem", "removeItem"] as const)(
    "Given sessionStorage %s throws a DOMException, When the snapshot is read, Then recovery returns no snapshot",
    (failingMethod) => {
      // Given
      setSessionStorage({
        getItem: () => {
          if (failingMethod === "getItem")
            throw new DOMException("storage unavailable", "QuotaExceededError")
          return JSON.stringify(snapshot)
        },
        removeItem: () => {
          if (failingMethod === "removeItem")
            throw new DOMException("storage unavailable", "QuotaExceededError")
        },
        setItem: () => undefined,
      })

      // When / Then
      expect(readMapSnapshot()).toBeUndefined()
    },
  )

  it("Given sessionStorage setItem throws a DOMException, When a snapshot is stored, Then history remains usable", () => {
    // Given
    setSessionStorage({
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new DOMException("storage unavailable", "QuotaExceededError")
      },
    })

    // When / Then
    expect(() => storeMapSnapshot(snapshot)).not.toThrow()
  })

  it.each(["getItem", "removeItem"] as const)(
    "Given sessionStorage %s throws a non-DOM error, When the snapshot is read, Then the error is not hidden",
    (failingMethod) => {
      // Given
      const programmingError = new TypeError(`broken ${failingMethod}`)
      setSessionStorage({
        getItem: () => {
          if (failingMethod === "getItem") throw programmingError
          return JSON.stringify(snapshot)
        },
        removeItem: () => {
          if (failingMethod === "removeItem") throw programmingError
        },
        setItem: () => undefined,
      })

      // When / Then
      expect(() => readMapSnapshot()).toThrow(programmingError)
    },
  )

  it("Given sessionStorage setItem throws a non-DOM error, When the snapshot is stored, Then the error is not hidden", () => {
    // Given
    const programmingError = new TypeError("broken setItem")
    setSessionStorage({
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw programmingError
      },
    })

    // When / Then
    expect(() => storeMapSnapshot(snapshot)).toThrow(programmingError)
  })

  it("Given snapshot serialization throws a DOMException, When it is stored, Then the error is not misclassified as storage failure", () => {
    // Given
    const serializationError = new DOMException("broken serialization", "DataCloneError")
    const brokenSnapshot = {
      ...snapshot,
      toJSON: () => {
        throw serializationError
      },
    }
    setSessionStorage({
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => undefined,
    })

    // When / Then
    expect(() => storeMapSnapshot(brokenSnapshot)).toThrow(serializationError)
  })
})
