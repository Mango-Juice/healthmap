"use client"

import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useState,
} from "react"
import type { DetailMotion, DetailPhase } from "./detail-history"

type DetailSurfaceInput = {
  readonly clear: () => void
  readonly openingFrame: MutableRefObject<number | undefined>
  readonly phase: DetailPhase
  readonly selectedSlug: string | undefined
  readonly setMotion: Dispatch<SetStateAction<DetailMotion>>
  readonly setPhase: Dispatch<SetStateAction<DetailPhase>>
}

export function useDetailSurface({
  clear,
  openingFrame,
  phase,
  selectedSlug,
  setMotion,
  setPhase,
}: DetailSurfaceInput) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)")
    const update = (): void => setIsMobile(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    if (selectedSlug === undefined || phase !== "opening") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMotion("settled")
      setPhase("open")
      return
    }
    openingFrame.current = window.requestAnimationFrame(() => {
      openingFrame.current = window.requestAnimationFrame(() => {
        openingFrame.current = window.requestAnimationFrame(() => setMotion("settled"))
      })
    })
    return () => {
      if (openingFrame.current !== undefined) window.cancelAnimationFrame(openingFrame.current)
    }
  }, [openingFrame, phase, selectedSlug, setMotion, setPhase])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && selectedSlug !== undefined) clear()
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [clear, selectedSlug])

  return { isMobile }
}
