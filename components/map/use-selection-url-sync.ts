"use client"

import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useRef } from "react"
import type { Place } from "../../lib/domain/catalog"
import type { PlaceFilter } from "../../lib/domain/filter"
import type { MapView } from "../../lib/domain/geo"
import { canonicalizeShareUrl, parseShareUrl } from "../../lib/domain/share"
import { parseMapShareQuery, serializeMapShareQuery } from "../../lib/domain/share-query"
import {
  type DetailMotion,
  type DetailPhase,
  type HistorySnapshot,
  isHistorySnapshot,
  readMapSnapshot,
} from "./detail-history"
import type { CatalogState } from "./use-catalog"
import type { SharedEntrySource } from "./use-shared-entry-analytics"

type Input = {
  readonly beginClose: () => void
  readonly catalogState: CatalogState
  readonly didInitializeUrl: MutableRefObject<boolean>
  readonly initialPlaces: readonly Place[]
  readonly mapSnapshot: MutableRefObject<HistorySnapshot | undefined>
  readonly restoreDiscovery: (state: HistorySnapshot) => void
  readonly selectedFromDiscovery: MutableRefObject<boolean>
  readonly selectedSlugRef: MutableRefObject<string | undefined>
  readonly setDidResolveEntry: Dispatch<SetStateAction<boolean>>
  readonly setFilter: (filter: PlaceFilter) => void
  readonly setLinkNotice: Dispatch<SetStateAction<string | undefined>>
  readonly setMotion: Dispatch<SetStateAction<DetailMotion>>
  readonly setPhase: Dispatch<SetStateAction<DetailPhase>>
  readonly setSelectedSlug: Dispatch<SetStateAction<string | undefined>>
  readonly setView: (view: MapView) => void
  readonly sharedEntrySource: MutableRefObject<SharedEntrySource | undefined>
}

export function useSelectionUrlSync(input: Input): void {
  const lastRecoveredUrl = useRef<string | undefined>(undefined)
  const {
    beginClose,
    catalogState,
    didInitializeUrl,
    initialPlaces,
    mapSnapshot,
    restoreDiscovery,
    selectedFromDiscovery,
    selectedSlugRef,
    setDidResolveEntry,
    setFilter,
    setLinkNotice,
    setMotion,
    setPhase,
    setSelectedSlug,
    setView,
    sharedEntrySource,
  } = input
  useEffect(() => {
    if (catalogState !== "ready") return
    const recoverFromUrl = (): void => {
      const wasSelected = selectedSlugRef.current !== undefined
      const pathPlace = initialPlaces.find(
        (candidate) =>
          candidate.published &&
          window.location.pathname === `/places/${encodeURIComponent(candidate.slug)}`,
      )
      if (pathPlace !== undefined) {
        selectedFromDiscovery.current = false
        setSelectedSlug(pathPlace.slug)
        setPhase("opening")
        setMotion("start")
        sharedEntrySource.current = "place_share"
        return
      }
      const mapShareQuery = parseMapShareQuery(window.location.search)
      if (mapShareQuery !== null) {
        if (wasSelected) beginClose()
        else {
          setSelectedSlug(undefined)
          setPhase("closed")
        }
        sharedEntrySource.current = "map_share"
        mapSnapshot.current ??= readMapSnapshot()
        if (mapSnapshot.current === undefined && isHistorySnapshot(window.history.state))
          mapSnapshot.current = window.history.state
        if (mapSnapshot.current?.url === `${window.location.pathname}${window.location.search}`) {
          setFilter(mapSnapshot.current.filter)
          setView(mapSnapshot.current.view)
          restoreDiscovery(mapSnapshot.current)
          return
        }
        setFilter(mapShareQuery.tag)
        restoreDiscovery({
          appliedBounds: {
            southWest: {
              latitude: Math.max(-90, mapShareQuery.lat - 0.04),
              longitude: Math.max(-180, mapShareQuery.lng - 0.04),
            },
            northEast: {
              latitude: Math.min(90, mapShareQuery.lat + 0.04),
              longitude: Math.min(180, mapShareQuery.lng + 0.04),
            },
          },
          query: mapShareQuery.q,
          ingredient: mapShareQuery.ingredient,
          cooking: mapShareQuery.cooking,
          trayExpanded: true,
          filter: mapShareQuery.tag,
          view: {
            latitude: mapShareQuery.lat,
            longitude: mapShareQuery.lng,
            zoom: mapShareQuery.z,
          },
          url: `/?${serializeMapShareQuery(mapShareQuery)}`,
        })
        setView({
          latitude: mapShareQuery.lat,
          longitude: mapShareQuery.lng,
          zoom: mapShareQuery.z,
        })
        const canonicalUrl = `/?${serializeMapShareQuery(mapShareQuery)}`
        if (`${window.location.pathname}${window.location.search}` !== canonicalUrl)
          window.history.replaceState({}, "", canonicalUrl)
        return
      }
      const shareState = parseShareUrl(window.location.href)
      switch (shareState.kind) {
        case "place": {
          const place = initialPlaces.find(
            (candidate) => candidate.slug === shareState.slug && candidate.published,
          )
          if (place === undefined) {
            sharedEntrySource.current = undefined
            if (wasSelected) beginClose()
            else {
              setSelectedSlug(undefined)
              setPhase("closed")
            }
            setLinkNotice("유효하지 않은 장소 링크를 기본 지도로 복구했습니다.")
            window.history.replaceState({}, "", "/")
            return
          }
          selectedFromDiscovery.current = false
          setSelectedSlug(place.slug)
          setPhase("opening")
          setMotion("start")
          sharedEntrySource.current = shareState.source
          window.history.replaceState({}, "", canonicalizeShareUrl(window.location.href))
          return
        }
        case "map": {
          if (wasSelected) beginClose()
          else {
            setSelectedSlug(undefined)
            setPhase("closed")
          }
          sharedEntrySource.current = shareState.source
          mapSnapshot.current ??= readMapSnapshot()
          if (mapSnapshot.current === undefined && isHistorySnapshot(window.history.state))
            mapSnapshot.current = window.history.state
          if (mapSnapshot.current?.url === `${window.location.pathname}${window.location.search}`) {
            setFilter(mapSnapshot.current.filter)
            setView(mapSnapshot.current.view)
            restoreDiscovery(mapSnapshot.current)
            return
          }
          if (didInitializeUrl.current) {
            if (isHistorySnapshot(window.history.state)) {
              setFilter(window.history.state.filter)
              setView(window.history.state.view)
              restoreDiscovery(window.history.state)
            }
            return
          }
          setFilter(shareState.tag)
          setView({ ...shareState.center, zoom: shareState.zoom })
          window.history.replaceState({}, "", canonicalizeShareUrl(window.location.href))
          return
        }
        case "fallback":
          sharedEntrySource.current = undefined
          if (wasSelected) beginClose()
          else {
            setSelectedSlug(undefined)
            setPhase("closed")
          }
          if (isHistorySnapshot(window.history.state)) {
            mapSnapshot.current = window.history.state
            setFilter(window.history.state.filter)
            setView(window.history.state.view)
            restoreDiscovery(window.history.state)
          }
          if (window.location.search.length > 0) {
            setLinkNotice("유효하지 않은 공유 링크를 기본 지도로 복구했습니다.")
            window.history.replaceState({}, "", "/")
          }
          return
        default:
          assertNever(shareState)
      }
    }
    const recoverNavigation = (): void => {
      recoverFromUrl()
      lastRecoveredUrl.current = window.location.href
    }
    if (lastRecoveredUrl.current !== window.location.href) recoverNavigation()
    didInitializeUrl.current = true
    setDidResolveEntry(true)
    window.addEventListener("popstate", recoverNavigation)
    return () => window.removeEventListener("popstate", recoverNavigation)
  }, [
    beginClose,
    catalogState,
    didInitializeUrl,
    initialPlaces,
    mapSnapshot,
    restoreDiscovery,
    selectedFromDiscovery,
    selectedSlugRef,
    setDidResolveEntry,
    setFilter,
    setLinkNotice,
    setMotion,
    setPhase,
    setSelectedSlug,
    setView,
    sharedEntrySource,
  ])
}

const assertNever = (value: never): never => value
