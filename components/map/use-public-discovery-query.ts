"use client"

import { useEffect, useRef } from "react"
import type { PublicCatalogQuery } from "../../lib/catalog/query-contract"
import type { MenuConditions } from "../../lib/domain/discovery"
import type { ViewportBounds } from "../../lib/domain/viewport"

type Input = MenuConditions & {
  readonly enabled: boolean
  readonly hasArea: boolean
  readonly bounds: ViewportBounds
  readonly queryCatalog: (query: Partial<PublicCatalogQuery>) => Promise<void>
}
export function usePublicDiscoveryQuery({
  enabled,
  hasArea,
  bounds,
  queryCatalog,
  ...conditions
}: Input) {
  const initial = useRef(true)
  useEffect(() => {
    if (!enabled) return
    if (initial.current) {
      initial.current = false
      return
    }
    void queryCatalog({
      mode: hasArea || conditions.query.trim() ? "places" : "regions",
      query: conditions.query,
      filter: conditions.tag,
      ingredient: conditions.ingredient ?? "all",
      cooking: conditions.cooking ?? "all",
      ...(hasArea
        ? {
            south: bounds.southWest.latitude,
            north: bounds.northEast.latitude,
            west: bounds.southWest.longitude,
            east: bounds.northEast.longitude,
          }
        : {}),
    })
  }, [
    enabled,
    hasArea,
    bounds,
    queryCatalog,
    conditions.query,
    conditions.tag,
    conditions.ingredient,
    conditions.cooking,
  ])
}
