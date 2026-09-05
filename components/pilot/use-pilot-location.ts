import { useCallback, useEffect, useRef, useState } from "react"
import { type GeoPoint, LOCATION_OPTIONS } from "../../lib/domain/geo"
import type { PilotLocationOutcome } from "./use-pilot-analytics"

type PilotLocation =
  | { readonly status: "requesting" | "unavailable"; readonly point: undefined }
  | { readonly status: "available"; readonly point: GeoPoint }

type PilotLocationOptions = {
  readonly onOutcome?: ((outcome: PilotLocationOutcome) => void) | undefined
}

export function usePilotLocation({ onOutcome }: PilotLocationOptions = {}) {
  const started = useRef(false)
  const generation = useRef(0)
  const [location, setLocation] = useState<PilotLocation>({
    status: "requesting",
    point: undefined,
  })
  const request = useCallback(() => {
    const attempt = ++generation.current
    setLocation({ status: "requesting", point: undefined })
    const unavailable = (outcome: Exclude<PilotLocationOutcome, "resolved">) => {
      if (attempt !== generation.current) return
      onOutcome?.(outcome)
      setLocation({ status: "unavailable", point: undefined })
    }
    if (!navigator.geolocation) return unavailable("unsupported")
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (attempt !== generation.current) return
        onOutcome?.("resolved")
        setLocation({
          status: "available",
          point: { latitude: coords.latitude, longitude: coords.longitude },
        })
      },
      (error) => {
        unavailable(error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable")
      },
      LOCATION_OPTIONS,
    )
  }, [onOutcome])
  useEffect(() => {
    if (started.current) return
    started.current = true
    request()
  }, [request])
  return { ...location, request }
}
