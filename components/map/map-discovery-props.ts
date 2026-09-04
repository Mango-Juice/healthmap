import type { PublicCatalogQuery, PublicRegion } from "../../lib/catalog/query-contract"
import type { Menu, Place } from "../../lib/domain/catalog"
import type { DirectionsTarget } from "../../lib/domain/directions"
import type { CookingFilter, IngredientFilter, PlaceFilter } from "../../lib/domain/filter"
import type { GeoPoint } from "../../lib/domain/geo"
import type { ViewportBounds } from "../../lib/domain/viewport"

export type MapShareState = {
  readonly appliedBounds?: ViewportBounds | undefined
  readonly center: GeoPoint
  readonly query: string
  readonly tag: PlaceFilter
  readonly zoom: number
  readonly ingredient?: IngredientFilter | undefined
  readonly cooking?: CookingFilter | undefined
}

export type MapDiscoveryProperties = {
  readonly clientId?: string | undefined
  readonly directionsTargets?: Readonly<Partial<Record<Place["id"], DirectionsTarget>>> | undefined
  readonly initialCatalogQuery?: Partial<PublicCatalogQuery> | undefined
  readonly initialMenus: readonly Menu[]
  readonly initialRegions?: readonly PublicRegion[] | undefined
  readonly initialTotal?: number | undefined
  readonly initialNextCursor?: string | null | undefined
  readonly initialPlaces: readonly Place[]
  readonly initialCatalogState?: "ready" | "error" | undefined
  readonly initialMapState?: MapShareState | undefined
  readonly initialSelectedPlace?: Place | undefined
  readonly initialSelectedSlug?: string | undefined
  readonly initialSelectionSource?: "shared_link" | undefined
}
