"use client"

import { useMemo } from "react"
import type { Menu, Place } from "../../lib/domain/catalog"
import { type MenuConditions, matchingDiscoveryMenus } from "../../lib/domain/discovery"
import type { PlaceDistance } from "../../lib/domain/distance"

export function useDiscoveryMarkers({
  results,
  menus,
  selectedPlace,
  open,
  conditions,
}: {
  readonly results: readonly PlaceDistance[]
  readonly menus: readonly Menu[]
  readonly selectedPlace: Place | undefined
  readonly open: (place: Place, source: "map") => void
  readonly conditions: MenuConditions
}) {
  return useMemo(
    () =>
      results.map(({ place }) => {
        const matching = matchingDiscoveryMenus({ place, menus, ...conditions })
        const plant = matching.some(
          (menu) =>
            menu.schemaVersion === "2.0.0" &&
            (menu.facts.form === "salad_poke" || menu.facts.dietary !== "unknown"),
        )
        const grain = matching.some(
          (menu) =>
            menu.schemaVersion === "2.0.0" &&
            (menu.facts.form === "rice" || menu.facts.rice_base !== "unknown"),
        )
        const category = plant && grain ? "mixed" : plant ? "plant" : grain ? "grain" : "mixed"
        const selected = selectedPlace?.id === place.id
        return {
          id: place.id,
          iconUrl:
            place.schemaVersion === "2.0.0"
              ? `/markers/marker-${category}${selected ? "-selected" : ""}.svg`
              : selected
                ? "/markers/marker-selected.svg"
                : "/markers/marker-health.svg",
          label: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
          zIndex: selected ? 1000 : undefined,
          onSelect: () => open(place, "map"),
        }
      }),
    [results, menus, selectedPlace, open, conditions],
  )
}
