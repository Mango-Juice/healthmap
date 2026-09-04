"use client"

import { useEffect, useState } from "react"
import { loadPublicPlaceDetail } from "../../lib/catalog/query-client"
import type { Menu, Place } from "../../lib/domain/catalog"

export function usePlaceMenus(place: Place, initialMenus: readonly Menu[]) {
  const [loaded, setLoaded] = useState<{ readonly slug: string; readonly menus: readonly Menu[] }>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (place.schemaVersion !== "2.0.0") return
    const controller = new AbortController()
    void loadPublicPlaceDetail(place.slug, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setLoaded({ slug: place.slug, menus: result.menus })
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error)) throw error
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [place.schemaVersion, place.slug])
  return { menus: loaded?.slug === place.slug ? loaded.menus : initialMenus, failed }
}
