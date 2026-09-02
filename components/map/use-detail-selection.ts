"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { captureProductAnalytics } from "../../lib/analytics/browser"
import type { Place } from "../../lib/domain/catalog"
import type { PlaceFilter } from "../../lib/domain/filter"
import type { MapView } from "../../lib/domain/geo"
import type { ViewportBounds } from "../../lib/domain/viewport"
import {
  type DetailMotion,
  type DetailPhase,
  type HistorySnapshot,
  storeMapSnapshot,
} from "./detail-history"
import type { CatalogState } from "./use-catalog"
import { useDetailSurface } from "./use-detail-surface"
import { useSelectionFocus } from "./use-selection-focus"
import { useSelectionUrlSync } from "./use-selection-url-sync"
import { useSharedEntryAnalytics } from "./use-shared-entry-analytics"

export type { DetailMotion, DetailPhase } from "./detail-history"

type DetailSelectionInput = {
  readonly catalogState: CatalogState
  readonly filter: PlaceFilter
  readonly initialPlaces: readonly Place[]
  readonly initialSelectedSlug?: string | undefined
  readonly initialSelectionSource?: "shared_link" | undefined
  readonly discoverySnapshot: {
    readonly appliedBounds: ViewportBounds
    readonly query: string
    readonly trayExpanded: boolean
  }
  readonly restoreDiscovery: (state: {
    readonly appliedBounds: ViewportBounds
    readonly query: string
    readonly trayExpanded: boolean
  }) => void
  readonly setFilter: (filter: PlaceFilter) => void
  readonly setView: (view: MapView) => void
  readonly view: MapView
  readonly visiblePlaceSlugs: ReadonlySet<string>
}

const DETAIL_TRANSITION_BUFFER_MS = 48

export function useDetailSelection({
  catalogState,
  filter,
  initialPlaces,
  initialSelectedSlug,
  initialSelectionSource,
  discoverySnapshot,
  restoreDiscovery,
  setFilter,
  setView,
  view,
  visiblePlaceSlugs,
}: DetailSelectionInput) {
  const [selectedSlug, setSelectedSlug] = useState<string | undefined>(initialSelectedSlug)
  const [linkNotice, setLinkNotice] = useState<string>()
  const [didResolveEntry, setDidResolveEntry] = useState(false)
  const [phase, setPhase] = useState<DetailPhase>("closed")
  const [motion, setMotion] = useState<DetailMotion>("settled")
  const didInitializeUrl = useRef(false)
  const mapSnapshot = useRef<HistorySnapshot | undefined>(undefined)
  const selectedSlugRef = useRef<string | undefined>(undefined)
  const phaseRef = useRef<DetailPhase>("closed")
  const openingFrame = useRef<number | undefined>(undefined)
  const closingFrame = useRef<number | undefined>(undefined)
  const closeSafetyTimer = useRef<number | undefined>(undefined)
  const surfaceRef = useRef<HTMLElement>(null)
  const didRecordInitialSelection = useRef(false)
  const selectedFromDiscovery = useRef(false)
  const selectionFocus = useSelectionFocus(phase, selectedSlug)

  const setSurfaceRef = useCallback((element: HTMLElement | null): void => {
    surfaceRef.current = element
  }, [])

  const { recordExploration: recordSharedExploration, sourceRef: sharedEntrySource } =
    useSharedEntryAnalytics(didResolveEntry)

  const finishClose = useCallback((): void => {
    if (closeSafetyTimer.current !== undefined) {
      window.clearTimeout(closeSafetyTimer.current)
      closeSafetyTimer.current = undefined
    }
    phaseRef.current = "closed"
    const triggerSlug = selectedSlugRef.current
    selectedSlugRef.current = undefined
    selectionFocus.restore(triggerSlug)
    setPhase("closed")
    setSelectedSlug(undefined)
  }, [selectionFocus.restore])

  const beginClose = useCallback((): void => {
    const currentSlug = selectedSlugRef.current
    const currentPhase = phaseRef.current
    if (currentSlug === undefined || currentPhase === "closing") return
    if (openingFrame.current !== undefined) window.cancelAnimationFrame(openingFrame.current)
    if (closingFrame.current !== undefined) window.cancelAnimationFrame(closingFrame.current)
    setMotion("settled")
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishClose()
      return
    }
    if (currentPhase === "opening") {
      phaseRef.current = "open"
      setPhase("open")
      closingFrame.current = window.requestAnimationFrame(() => {
        phaseRef.current = "closing"
        setPhase("closing")
      })
    } else {
      phaseRef.current = "closing"
      setPhase("closing")
    }
    const surface = surfaceRef.current
    const duration = surface
      ? Number.parseFloat(getComputedStyle(surface).transitionDuration.split(",")[0] ?? "") * 1000
      : 240
    closeSafetyTimer.current = window.setTimeout(
      finishClose,
      Math.max(0, duration) + DETAIL_TRANSITION_BUFFER_MS,
    )
  }, [finishClose])

  const clear = useCallback((): void => {
    if (selectedSlugRef.current === undefined || phaseRef.current === "closing") return
    window.history.replaceState({}, "", mapSnapshot.current?.url ?? "/")
    beginClose()
  }, [beginClose])

  const { isMobile } = useDetailSurface({
    clear,
    openingFrame,
    phase,
    selectedSlug,
    setMotion,
    setPhase,
  })

  useEffect(() => {
    selectedSlugRef.current = selectedSlug
    phaseRef.current = phase
  }, [phase, selectedSlug])

  useSelectionUrlSync({
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
  })

  const open = useCallback(
    (place: Place, source: "map" | "list", trigger?: HTMLElement): void => {
      if (closingFrame.current !== undefined) window.cancelAnimationFrame(closingFrame.current)
      if (closeSafetyTimer.current !== undefined) {
        window.clearTimeout(closeSafetyTimer.current)
        closeSafetyTimer.current = undefined
      }
      setLinkNotice(undefined)
      selectionFocus.capture(trigger)
      const snapshot = {
        ...discoverySnapshot,
        filter,
        url: `${window.location.pathname}${window.location.search}`,
        view,
      }
      mapSnapshot.current = snapshot
      storeMapSnapshot(snapshot)
      window.history.replaceState(snapshot, "", window.location.href)
      selectedSlugRef.current = place.slug
      selectedFromDiscovery.current = true
      phaseRef.current = "opening"
      setSelectedSlug(place.slug)
      setPhase("opening")
      setMotion("start")
      window.history.pushState({}, "", `/places/${encodeURIComponent(place.slug)}`)
      captureProductAnalytics({
        event: "place_opened",
        properties: { place_id: place.id, source },
      })
      recordSharedExploration("place_opened")
    },
    [discoverySnapshot, filter, recordSharedExploration, selectionFocus.capture, view],
  )

  useEffect(() => {
    if (!selectedFromDiscovery.current || selectedSlug === undefined) return
    if (visiblePlaceSlugs.has(selectedSlug)) return
    clear()
  }, [clear, selectedSlug, visiblePlaceSlugs])

  useEffect(() => {
    if (initialSelectedSlug === undefined || initialSelectionSource !== "shared_link") return
    if (didRecordInitialSelection.current) return
    const place = initialPlaces.find((candidate) => candidate.slug === initialSelectedSlug)
    if (place === undefined) return
    didRecordInitialSelection.current = true
    captureProductAnalytics({
      event: "place_opened",
      properties: { place_id: place.id, source: "shared_link" },
    })
  }, [initialPlaces, initialSelectedSlug, initialSelectionSource])

  return {
    clear,
    finishClose,
    isMobile,
    linkNotice,
    motion,
    open,
    phase,
    recordSharedExploration,
    selectedSlug,
    setPhase,
    setSurfaceRef,
  }
}
