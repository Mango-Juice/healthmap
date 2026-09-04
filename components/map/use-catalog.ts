"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { loadPublicCatalogQuery } from "../../lib/catalog/query-client"
import type {
  PublicCatalogQuery,
  PublicCatalogQueryResponse,
  PublicRegion,
} from "../../lib/catalog/query-contract"
import type { Menu, Place } from "../../lib/domain/catalog"

export type CatalogState = "ready" | "loading" | "error"
type CatalogSeed = {
  readonly initialQuery?: Partial<PublicCatalogQuery>
  readonly initialMenus: readonly Menu[]
  readonly initialPlaces: readonly Place[]
  readonly initialState: "ready" | "error"
  readonly initialRegions?: readonly PublicRegion[]
  readonly initialTotal?: number
  readonly initialNextCursor?: string | null
}
export function useCatalog({
  initialMenus,
  initialQuery = { mode: "regions" },
  initialPlaces,
  initialState,
  initialRegions = [],
  initialTotal = initialPlaces.length,
  initialNextCursor = null,
}: CatalogSeed) {
  const [places, setPlaces] = useState(initialPlaces)
  const [menus, setMenus] = useState(initialMenus)
  const [regions, setRegions] = useState(initialRegions)
  const [facets, setFacets] = useState<PublicCatalogQueryResponse["facets"]>([])
  const [total, setTotal] = useState(initialTotal)
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [state, setState] = useState<CatalogState>(initialState)
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const activeQuery = useRef<Partial<PublicCatalogQuery>>(initialQuery)
  const didRetryInitialError = useRef(false)
  const queryCatalog = useCallback(async (query: Partial<PublicCatalogQuery>): Promise<void> => {
    const requestGeneration = ++generation.current
    controller.current?.abort()
    const requestController = new AbortController()
    controller.current = requestController
    activeQuery.current = query
    setState("loading")
    try {
      const payload = await loadPublicCatalogQuery(query, requestController.signal)
      if (requestGeneration !== generation.current) return
      setPlaces((current) =>
        query.cursor === undefined
          ? payload.places
          : [
              ...new Map(
                [...current, ...payload.places].map((place) => [place.id, place]),
              ).values(),
            ],
      )
      setMenus((current) =>
        query.cursor === undefined
          ? payload.menus
          : [...new Map([...current, ...payload.menus].map((menu) => [menu.id, menu])).values()],
      )
      setRegions(payload.regions)
      setFacets(payload.facets)
      setTotal(payload.total)
      setNextCursor(payload.nextCursor)
      setState("ready")
    } catch {
      if (requestGeneration === generation.current) setState("error")
    }
  }, [])
  const reload = useCallback(() => {
    const { cursor: _cursor, ...query } = activeQuery.current
    return queryCatalog(query)
  }, [queryCatalog])
  const loadMore = useCallback(async () => {
    if (nextCursor !== null) await queryCatalog({ ...activeQuery.current, cursor: nextCursor })
  }, [nextCursor, queryCatalog])
  useEffect(
    () => () => {
      generation.current += 1
      controller.current?.abort()
    },
    [],
  )
  useEffect(() => {
    if (initialState !== "error" || didRetryInitialError.current) return
    didRetryInitialError.current = true
    void reload()
  }, [initialState, reload])
  return {
    menus,
    places,
    reload,
    state,
    regions,
    facets,
    total,
    nextCursor,
    queryCatalog,
    loadMore,
  }
}
