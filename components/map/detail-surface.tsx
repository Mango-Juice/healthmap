"use client"

import type {
  KeyboardEvent as ReactKeyboardEvent,
  TransitionEvent as ReactTransitionEvent,
} from "react"
import type { Place } from "../../lib/domain/catalog"
import styles from "./map-discovery.module.css"
import type { MapDiscoverySurfaceModel } from "./map-discovery-model"
import { PlaceDetail } from "./place-detail"

export function DetailSurface({
  model,
  place,
}: {
  readonly model: MapDiscoverySurfaceModel
  readonly place: Place
}) {
  const { detail, discovery, filter, view } = model
  const content = (
    <PlaceDetail
      key={place.slug}
      directionsTarget={detail.directionsTargets?.[place.id]}
      menus={detail.menus}
      onClose={detail.clear}
      place={place}
      shareMap={{
        latitude: view.latitude,
        longitude: view.longitude,
        query: discovery.query,
        tag: filter.selected,
        zoom: view.zoom,
      }}
    />
  )
  const handleTransitionEnd = (event: ReactTransitionEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget) return
    if (detail.phase === "closing") detail.finishClose()
    if (detail.phase === "opening" && event.propertyName === "opacity") detail.setPhase("open")
  }

  if (!detail.isMobile)
    return (
      <aside
        aria-label="장소 상세"
        className={styles["detailSurface"]}
        data-detail-motion={detail.motion}
        data-detail-phase={detail.phase}
        ref={detail.setSurfaceRef}
        onTransitionEnd={handleTransitionEnd}
      >
        {content}
      </aside>
    )

  return (
    <div
      aria-label="장소 상세"
      aria-modal="true"
      className={styles["detailSurface"]}
      data-detail-motion={detail.motion}
      data-detail-phase={detail.phase}
      ref={detail.setSurfaceRef}
      onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Tab") return
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
          ),
        ).filter((element) => element.getClientRects().length > 0)
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (first === undefined || last === undefined) return
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }}
      onTransitionEnd={handleTransitionEnd}
      role="dialog"
    >
      {content}
    </div>
  )
}
