import type { Place } from "./catalog.ts"
import type { HealthTag } from "./contracts.ts"

export type PlaceFilter = "all" | HealthTag

export const filterPlaces = (places: readonly Place[], filter: PlaceFilter): readonly Place[] =>
  filter === "all" ? places : places.filter((place) => place.healthTags.includes(filter))
