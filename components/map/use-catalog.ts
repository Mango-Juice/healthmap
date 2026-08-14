"use client"

import { useCallback, useRef, useState } from "react"
import { loadPublicCatalog } from "../../lib/catalog/public-catalog-client"
import type { Menu, Place } from "../../lib/domain/catalog"

export type CatalogState = "ready" | "loading" | "error"

type CatalogSeed = {
  readonly initialMenus: readonly Menu[]
  readonly initialPlaces: readonly Place[]
  readonly initialState: "ready" | "error"
}

export function useCatalog({ initialMenus, initialPlaces, initialState }: CatalogSeed) {
  const [places, setPlaces] = useState(initialPlaces)
  const [menus, setMenus] = useState(initialMenus)
  const [state, setState] = useState<CatalogState>(initialState)
  const generation = useRef(0)

  const reload = useCallback(async (): Promise<void> => {
    const requestGeneration = generation.current + 1
    generation.current = requestGeneration
    setState("loading")
    try {
      const payload = await loadPublicCatalog()
      if (requestGeneration !== generation.current) return
      setPlaces(payload.places)
      setMenus(payload.menus)
      setState("ready")
    } catch {
      if (requestGeneration === generation.current) setState("error")
    }
  }, [])

  return { menus, places, reload, state }
}
