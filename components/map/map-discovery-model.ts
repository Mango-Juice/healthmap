import type { RefObject } from "react"
import type { PublicRegion } from "../../lib/catalog/query-contract"
import type { Menu, Place } from "../../lib/domain/catalog"
import type { DirectionsTarget } from "../../lib/domain/directions"
import type { PlaceDistance } from "../../lib/domain/distance"
import type { CookingFilter, IngredientFilter, PlaceFilter } from "../../lib/domain/filter"
import type { LocationState, MapView } from "../../lib/domain/geo"
import type { ViewportBounds } from "../../lib/domain/viewport"
import type { MapAdapterState } from "../../lib/map/adapter"
import type { DetailMotion, DetailPhase } from "./detail-history"
import type { CatalogState } from "./use-catalog"

export type MapDiscoverySurfaceModel = {
  readonly adapter: {
    readonly containerRef: RefObject<HTMLDivElement | null>
    readonly retry: () => void
    readonly state: MapAdapterState
  }
  readonly catalog: {
    readonly menus: readonly Menu[]
    readonly reload: () => void
    readonly results: readonly PlaceDistance[]
    readonly state: CatalogState
    readonly regions: readonly PublicRegion[]
    readonly total: number
    readonly legacyFacets: readonly { readonly filter: PlaceFilter; readonly count: number }[]
    readonly distanceFromUser: boolean
    readonly loadMore: (() => void) | undefined
  }
  readonly discovery: {
    readonly resetRegion: () => void
    readonly applyArea: () => void
    readonly onSearchCommit: () => void
    readonly pending: boolean
    readonly query: string
    readonly setQuery: (query: string) => void
    readonly setTrayExpanded: (expanded: boolean) => void
    readonly trayExpanded: boolean
    readonly ingredient: IngredientFilter
    readonly cooking: CookingFilter
    readonly setIngredient: (value: IngredientFilter) => void
    readonly setCooking: (value: CookingFilter) => void
    readonly selectRegion: (bounds: ViewportBounds) => void
  }
  readonly detail: {
    readonly clear: () => void
    readonly directionsTargets?:
      | Readonly<Partial<Record<Place["id"], DirectionsTarget>>>
      | undefined
    readonly finishClose: () => void
    readonly isMobile: boolean
    readonly linkNotice: string | undefined
    readonly menus: readonly Menu[]
    readonly motion: DetailMotion
    readonly onSelectPlace: (
      place: Place,
      source: "map" | "list",
      trigger?: HTMLElement | undefined,
    ) => void
    readonly phase: DetailPhase
    readonly selectedPlace: Place | undefined
    readonly setPhase: (phase: DetailPhase) => void
    readonly setSurfaceRef: (element: HTMLElement | null) => void
  }
  readonly filter: {
    readonly onSelect: (filter: PlaceFilter) => void
    readonly selected: PlaceFilter
    readonly legacy: boolean
  }
  readonly location: {
    readonly request: (isUserRequested: boolean) => void
    readonly state: LocationState
  }
  readonly view: MapView
}
