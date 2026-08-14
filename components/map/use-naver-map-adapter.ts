"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { GeoPoint, MapView } from "../../lib/domain/geo"
import {
  cancelNaverMapsLoad,
  createNaverMapAdapter,
  loadNaverMaps,
  type MapAdapter,
  type MapAdapterState,
} from "../../lib/map/adapter"

type NaverMapAdapterInput = {
  readonly clientId?: string | undefined
  readonly view: MapView
}

export function useNaverMapAdapter({ clientId, view }: NaverMapAdapterInput) {
  const [state, setState] = useState<MapAdapterState>(clientId ? "loading" : "fallback")
  const containerRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<MapAdapter>(null)
  const generation = useRef(0)

  const load = useCallback((): void => {
    const requestGeneration = generation.current + 1
    generation.current = requestGeneration
    if (!clientId) {
      setState("fallback")
      return
    }
    setState("loading")
    loadNaverMaps(clientId).then(
      () => {
        if (requestGeneration !== generation.current) return
        const container = containerRef.current
        if (!container) return setState("error")
        try {
          adapterRef.current?.destroy()
          adapterRef.current = createNaverMapAdapter(container, view)
          setState("ready")
        } catch {
          setState("error")
        }
      },
      () => {
        if (requestGeneration === generation.current) setState("error")
      },
    )
  }, [clientId, view])

  const recenter = useCallback((point: GeoPoint, zoom: number): void => {
    adapterRef.current?.recenter(point, zoom)
  }, [])

  useEffect(() => load(), [load])
  useEffect(
    () => () => {
      cancelNaverMapsLoad()
      adapterRef.current?.destroy()
    },
    [],
  )

  return { containerRef, load, recenter, state }
}
