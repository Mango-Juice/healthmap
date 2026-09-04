import { useCallback, useEffect, useRef, useState } from "react"
import { type GeoPoint, LOCATION_OPTIONS } from "../../lib/domain/geo"

type PilotLocation =
  | { readonly status: "requesting" | "unavailable"; readonly point: undefined }
  | { readonly status: "available"; readonly point: GeoPoint }

export function usePilotLocation() {
  const started = useRef(false)
  const generation = useRef(0)
  const [location, setLocation] = useState<PilotLocation>({
    status: "requesting",
    point: undefined,
  })
  const request = useCallback(() => {
    const attempt = ++generation.current
    setLocation({ status: "requesting", point: undefined })
    const unavailable = () => {
      if (attempt === generation.current) setLocation({ status: "unavailable", point: undefined })
    }
    if (!navigator.geolocation) return unavailable()
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (attempt !== generation.current) return
        setLocation({
          status: "available",
          point: { latitude: coords.latitude, longitude: coords.longitude },
        })
      },
      unavailable,
      LOCATION_OPTIONS,
    )
  }, [])
  useEffect(() => {
    if (started.current) return
    started.current = true
    request()
  }, [request])
  return { ...location, request }
}
