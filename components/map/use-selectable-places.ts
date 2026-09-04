"use client"

import { useMemo } from "react"
import type { Place } from "../../lib/domain/catalog"

export const useSelectablePlaces = (places: readonly Place[], selectedPlace: Place | undefined) => {
  const publishedPlaces = useMemo(() => places.filter((place) => place.published), [places])
  const selectablePlaces = useMemo(
    () =>
      selectedPlace !== undefined && !publishedPlaces.some((place) => place.id === selectedPlace.id)
        ? [...publishedPlaces, selectedPlace]
        : publishedPlaces,
    [selectedPlace, publishedPlaces],
  )
  return { publishedPlaces, selectablePlaces }
}
