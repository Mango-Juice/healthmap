"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { GeoPoint, MapView } from "../../lib/domain/geo"
import type { MapFitBoundsMargin, MapMarkerSpec, MapViewportSnapshot } from "../../lib/map/adapter"
import {
  cancelNaverMapsLoad,
  createNaverMapAdapter,
  loadNaverMaps,
  type MapAdapter,
  type MapAdapterState,
  MapSdkLoadError,
  resetNaverMapsLoad,
  subscribeToNaverMapsAuthFailure,
} from "../../lib/map/adapter"

type NaverMapAdapterInput = {
  readonly clientId?: string | undefined
  readonly markers: readonly MapMarkerSpec[]
  readonly onViewportChanged?: ((snapshot: MapViewportSnapshot) => void) | undefined
  readonly view: MapView
}

export function useNaverMapAdapter({
  clientId,
  markers,
  onViewportChanged,
  view,
}: NaverMapAdapterInput) {
  const [state, setState] = useState<MapAdapterState>(clientId ? "loading" : "error")
  const containerRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<MapAdapter>(null)
  const markersRef = useRef(markers)
  const viewRef = useRef(view)
  const syncedMarkersRef = useRef<readonly MapMarkerSpec[] | null>(null)
  const generation = useRef(0)
  const readinessTimerRef = useRef<number>(undefined)
  const unsubscribeAuthFailureRef = useRef<(() => void) | undefined>(undefined)

  const load = useCallback((): void => {
    const requestGeneration = generation.current + 1
    generation.current = requestGeneration
    if (readinessTimerRef.current !== undefined) window.clearTimeout(readinessTimerRef.current)
    readinessTimerRef.current = undefined
    unsubscribeAuthFailureRef.current?.()
    unsubscribeAuthFailureRef.current = undefined
    adapterRef.current?.destroy()
    adapterRef.current = null
    syncedMarkersRef.current = null
    containerRef.current?.replaceChildren()
    if (!clientId) {
      setState("error")
      return
    }
    const fail = (nativeListenersAreValid = true): void => {
      if (requestGeneration !== generation.current) return
      if (readinessTimerRef.current !== undefined) window.clearTimeout(readinessTimerRef.current)
      readinessTimerRef.current = undefined
      if (nativeListenersAreValid) adapterRef.current?.destroy()
      else adapterRef.current?.teardownAfterProviderFailure()
      adapterRef.current = null
      containerRef.current?.replaceChildren()
      resetNaverMapsLoad()
      setState("error")
    }
    unsubscribeAuthFailureRef.current = subscribeToNaverMapsAuthFailure(() => fail(false))
    setState("loading")
    loadNaverMaps(clientId).then(
      () => {
        if (requestGeneration !== generation.current) return
        const container = containerRef.current
        if (!container) return fail()
        try {
          const adapter = createNaverMapAdapter(
            container,
            viewRef.current,
            undefined,
            onViewportChanged,
          )
          adapterRef.current = adapter
          readinessTimerRef.current = window.setTimeout(() => fail(), 10_000)
          adapter.waitUntilReady().then(() => {
            if (requestGeneration !== generation.current) return
            if (readinessTimerRef.current !== undefined)
              window.clearTimeout(readinessTimerRef.current)
            readinessTimerRef.current = undefined
            adapter.syncMarkers(markersRef.current)
            syncedMarkersRef.current = markersRef.current
            setState("ready")
          })
        } catch (error) {
          if (error instanceof MapSdkLoadError) fail()
          else throw error
        }
      },
      () => fail(),
    )
  }, [clientId, onViewportChanged])

  const recenter = useCallback((point: GeoPoint, zoom: number): void => {
    adapterRef.current?.recenter(point, zoom)
  }, [])
  const fitBounds = useCallback(
    (points: readonly GeoPoint[], margin: MapFitBoundsMargin): void =>
      adapterRef.current?.fitBounds(points, margin),
    [],
  )

  useEffect(() => {
    markersRef.current = markers
  }, [markers])
  useEffect(() => {
    viewRef.current = view
  }, [view])
  useEffect(() => load(), [load])
  useEffect(() => {
    if (state !== "ready" || syncedMarkersRef.current === markers) return
    adapterRef.current?.syncMarkers(markers)
    syncedMarkersRef.current = markers
  }, [markers, state])
  useEffect(
    () => () => {
      generation.current += 1
      if (readinessTimerRef.current !== undefined) window.clearTimeout(readinessTimerRef.current)
      unsubscribeAuthFailureRef.current?.()
      cancelNaverMapsLoad()
      adapterRef.current?.destroy()
    },
    [],
  )

  return { containerRef, fitBounds, load, recenter, state }
}
