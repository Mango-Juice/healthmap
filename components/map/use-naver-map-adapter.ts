"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { GeoPoint, MapView } from "../../lib/domain/geo"
import type { MapMarkerSpec } from "../../lib/map/adapter"
import {
  cancelNaverMapsLoad,
  createNaverMapAdapter,
  loadNaverMaps,
  type MapAdapter,
  type MapAdapterState,
  resetNaverMapsLoad,
  subscribeToNaverMapsAuthFailure,
} from "../../lib/map/adapter"

type NaverMapAdapterInput = {
  readonly clientId?: string | undefined
  readonly markers: readonly MapMarkerSpec[]
  readonly view: MapView
}

export function useNaverMapAdapter({ clientId, markers, view }: NaverMapAdapterInput) {
  const [state, setState] = useState<MapAdapterState>(clientId ? "loading" : "error")
  const containerRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<MapAdapter>(null)
  const markersRef = useRef(markers)
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
    const fail = (): void => {
      if (requestGeneration !== generation.current) return
      if (readinessTimerRef.current !== undefined) window.clearTimeout(readinessTimerRef.current)
      readinessTimerRef.current = undefined
      adapterRef.current?.destroy()
      adapterRef.current = null
      containerRef.current?.replaceChildren()
      resetNaverMapsLoad()
      setState("error")
    }
    unsubscribeAuthFailureRef.current = subscribeToNaverMapsAuthFailure(fail)
    setState("loading")
    loadNaverMaps(clientId).then(() => {
      if (requestGeneration !== generation.current) return
      const container = containerRef.current
      if (!container) return fail()
      try {
        const adapter = createNaverMapAdapter(container, view)
        adapterRef.current = adapter
        readinessTimerRef.current = window.setTimeout(fail, 10_000)
        adapter.waitUntilReady().then(() => {
          if (requestGeneration !== generation.current) return
          if (readinessTimerRef.current !== undefined)
            window.clearTimeout(readinessTimerRef.current)
          readinessTimerRef.current = undefined
          adapter.syncMarkers(markersRef.current)
          syncedMarkersRef.current = markersRef.current
          setState("ready")
        })
      } catch {
        fail()
      }
    }, fail)
  }, [clientId, view])

  const recenter = useCallback((point: GeoPoint, zoom: number): void => {
    adapterRef.current?.recenter(point, zoom)
  }, [])

  useEffect(() => {
    markersRef.current = markers
  }, [markers])
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

  return { containerRef, load, recenter, state }
}
