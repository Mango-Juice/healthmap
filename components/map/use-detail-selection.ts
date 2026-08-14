"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { captureProductAnalytics } from "../../lib/analytics/browser"
import type { Place } from "../../lib/domain/catalog"
import type { PlaceFilter } from "../../lib/domain/filter"
import type { MapView } from "../../lib/domain/geo"
import { canonicalizeShareUrl, parseShareUrl, serializePlaceShare } from "../../lib/domain/share"
import {
  type DetailMotion,
  type DetailPhase,
  type HistorySnapshot,
  isHistorySnapshot,
  readMapSnapshot,
  storeMapSnapshot,
} from "./detail-history"
import { useDetailSurface } from "./use-detail-surface"
import { useSharedEntryAnalytics } from "./use-shared-entry-analytics"

export type { DetailMotion, DetailPhase } from "./detail-history"

type DetailSelectionInput = {
  readonly filter: PlaceFilter
  readonly initialPlaces: readonly Place[]
  readonly setFilter: (filter: PlaceFilter) => void
  readonly setView: (view: MapView) => void
  readonly view: MapView
}

const DETAIL_TRANSITION_BUFFER_MS = 48

export function useDetailSelection({
  filter,
  initialPlaces,
  setFilter,
  setView,
  view,
}: DetailSelectionInput) {
  const [selectedSlug, setSelectedSlug] = useState<string>()
  const [linkNotice, setLinkNotice] = useState<string>()
  const [didResolveEntry, setDidResolveEntry] = useState(false)
  const [phase, setPhase] = useState<DetailPhase>("closed")
  const [motion, setMotion] = useState<DetailMotion>("settled")
  const didInitializeUrl = useRef(false)
  const mapSnapshot = useRef<HistorySnapshot | undefined>(undefined)
  const selectionTrigger = useRef<HTMLElement | undefined>(undefined)
  const selectedSlugRef = useRef<string | undefined>(undefined)
  const phaseRef = useRef<DetailPhase>("closed")
  const openingFrame = useRef<number | undefined>(undefined)
  const closingFrame = useRef<number | undefined>(undefined)
  const closeSafetyTimer = useRef<number | undefined>(undefined)
  const surfaceRef = useRef<HTMLElement>(null)

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
    setPhase("closed")
    setSelectedSlug(undefined)
    const trigger = selectionTrigger.current
    selectionTrigger.current = undefined
    if (trigger?.isConnected) {
      trigger.focus({ preventScroll: true })
    } else if (triggerSlug !== undefined) {
      document
        .querySelector<HTMLElement>(`[data-place-slug="${triggerSlug}"]`)
        ?.querySelector<HTMLElement>("button")
        ?.focus({ preventScroll: true })
    }
  }, [])

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
    window.history.replaceState({}, "", "/")
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

  useEffect(() => {
    const recoverFromUrl = (): void => {
      const wasSelected = selectedSlugRef.current !== undefined
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
          const browserSnapshot = window.history.state
          if (mapSnapshot.current === undefined && isHistorySnapshot(browserSnapshot))
            mapSnapshot.current = browserSnapshot
          if (mapSnapshot.current?.url === `${window.location.pathname}${window.location.search}`) {
            setFilter(mapSnapshot.current.filter)
            setView(mapSnapshot.current.view)
            return
          }
          if (didInitializeUrl.current) {
            if (isHistorySnapshot(window.history.state)) {
              setFilter(window.history.state.filter)
              setView(window.history.state.view)
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
          if (window.location.search.length > 0) {
            setLinkNotice("유효하지 않은 공유 링크를 기본 지도로 복구했습니다.")
            window.history.replaceState({}, "", "/")
          }
          return
        default:
          assertNever(shareState)
      }
    }
    recoverFromUrl()
    didInitializeUrl.current = true
    setDidResolveEntry(true)
    window.addEventListener("popstate", recoverFromUrl)
    return () => window.removeEventListener("popstate", recoverFromUrl)
  }, [beginClose, initialPlaces, setFilter, setView, sharedEntrySource])

  const open = useCallback(
    (place: Place): void => {
      if (closingFrame.current !== undefined) window.cancelAnimationFrame(closingFrame.current)
      if (closeSafetyTimer.current !== undefined) {
        window.clearTimeout(closeSafetyTimer.current)
        closeSafetyTimer.current = undefined
      }
      const activeElement = document.activeElement
      selectionTrigger.current = activeElement instanceof HTMLElement ? activeElement : undefined
      setLinkNotice(undefined)
      const snapshot = { filter, url: `${window.location.pathname}${window.location.search}`, view }
      storeMapSnapshot(snapshot)
      window.history.replaceState(snapshot, "", window.location.href)
      selectedSlugRef.current = place.slug
      phaseRef.current = "opening"
      setSelectedSlug(place.slug)
      setPhase("opening")
      setMotion("start")
      window.history.pushState({}, "", serializePlaceShare(place.slug))
      captureProductAnalytics({
        event: "place_opened",
        properties: { place_id: place.id, source: "map" },
      })
      recordSharedExploration("place_opened")
    },
    [filter, recordSharedExploration, view],
  )

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

const assertNever = (value: never): never => value
