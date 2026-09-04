import type { GeoPoint } from "../../lib/domain/geo"
import {
  type PilotDiscoveryFilter,
  type PilotIngredientFilter,
  presentPilotMenuName,
} from "../../lib/pilot/discovery"
import type {
  PilotPlaceDto as PilotPlace,
  PilotPlaceResultDto as PilotResult,
} from "../../lib/pilot/dto"
import { ChevronRightIcon } from "../ui/health-map-icons"
import { ActionButton } from "../ui/health-map-primitives"
import { PilotCategoryTags } from "./pilot-category-tags"
import styles from "./pilot-discovery.module.css"
import { PilotThumbnail } from "./pilot-thumbnail"

type Properties = {
  readonly origin: GeoPoint | undefined
  readonly total: number
  readonly loading: boolean
  readonly failed: boolean
  readonly onRetry: () => void
  readonly onLoadMore: (() => void) | undefined
  readonly filter: PilotDiscoveryFilter
  readonly ingredient: PilotIngredientFilter
  readonly onFilterChange: (filter: PilotDiscoveryFilter) => void
  readonly onIngredientChange: (filter: PilotIngredientFilter) => void
  readonly onQueryChange: (query: string) => void
  readonly onClearArea: (() => void) | undefined
  readonly onSelect: (id: PilotPlace["id"], trigger: HTMLButtonElement) => void
  readonly results: readonly PilotResult[]
  readonly query: string
}

export function PilotResults({
  origin,
  total,
  loading,
  failed,
  onRetry,
  onLoadMore,
  filter,
  ingredient,
  onFilterChange,
  onIngredientChange,
  onQueryChange,
  onClearArea,
  onSelect,
  results,
  query,
}: Properties) {
  return (
    <section className={styles["results"]}>
      <header className={styles["resultsHeader"]}>
        <div className={styles["resultsMeta"]}>
          <output aria-label="검색 결과 수">
            {loading ? "찾는 중" : `${total}곳 중 ${results.length}곳`}
          </output>
        </div>
      </header>
      <div className={styles["scrollBody"]}>
        {failed && results.length === 0 ? (
          <div className={styles["empty"]} role="alert">
            <strong>메뉴를 불러오지 못했어요.</strong>
            <ActionButton onClick={onRetry} variant="secondary">
              메뉴 다시 불러오기
            </ActionButton>
          </div>
        ) : loading && results.length === 0 ? (
          <div className={styles["empty"]} role="status">
            메뉴를 찾고 있어요.
          </div>
        ) : results.length === 0 ? (
          <div className={styles["empty"]} role="status">
            <strong>찾으시는 메뉴가 아직 없어요.</strong>
            <span>실제 매장에는 다른 메뉴가 있을 수 있어요.</span>
            {query ? (
              <ActionButton onClick={() => onQueryChange("")} variant="secondary">
                검색어 지우기
              </ActionButton>
            ) : null}
            {onClearArea ? (
              <ActionButton onClick={onClearArea} variant="secondary">
                전체 지역에서 찾기
              </ActionButton>
            ) : null}
            {filter !== "all" || ingredient !== "all" ? (
              <ActionButton
                onClick={() => {
                  onFilterChange("all")
                  onIngredientChange("all")
                }}
                variant="secondary"
              >
                선택한 메뉴 조건 해제
              </ActionButton>
            ) : null}
          </div>
        ) : (
          <ol aria-label="건강식 검색 결과" className={styles["list"]}>
            {results.map((result) => {
              const { place } = result
              const menus = result.menus.filter((menu) => result.matchingMenuIds.includes(menu.id))
              const first = menus[0]
              const distance = origin
                ? 6371 *
                  Math.hypot(
                    ((place.latitude - origin.latitude) * Math.PI) / 180,
                    (((place.longitude - origin.longitude) * Math.PI) / 180) *
                      Math.cos(((place.latitude + origin.latitude) * Math.PI) / 360),
                  )
                : undefined
              return (
                <li key={place.id}>
                  <button
                    aria-label={`${place.name} 자세히 보기`}
                    data-pilot-place-id={place.id}
                    onClick={(event) => onSelect(place.id, event.currentTarget)}
                    type="button"
                  >
                    <PilotThumbnail media={place.media} />
                    <span className={styles["cardHeading"]}>
                      <strong>{place.name}</strong>
                      <ChevronRightIcon />
                    </span>
                    <span className={styles["cardSummary"]}>
                      <span className={styles["menuPreview"]}>
                        {first ? presentPilotMenuName(first.name) : null}
                        {menus.length > 1 ? <small> 외 {menus.length - 1}가지</small> : null}
                      </span>
                      <PilotCategoryTags menus={first ? [first] : []} />
                    </span>
                    {first?.facts.ordering_note ? (
                      <span className={styles["cardNotices"]}>{first.facts.ordering_note}</span>
                    ) : null}
                    <span className={styles["cardLocation"]}>
                      <span className={styles["cardAddress"]} title={place.address}>
                        {place.address}
                      </span>
                      {distance !== undefined ? (
                        <span className={styles["distance"]}>
                          내 위치에서 직선 {distance.toFixed(1)}km
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
        {failed && results.length > 0 ? (
          <div className={styles["pagination"]} role="alert">
            <span>다음 메뉴를 불러오지 못했어요.</span>
            <ActionButton onClick={onRetry} variant="secondary">
              메뉴 다시 불러오기
            </ActionButton>
          </div>
        ) : null}
        {onLoadMore && !failed ? (
          <div className={styles["pagination"]}>
            <ActionButton onClick={onLoadMore} disabled={loading} variant="secondary">
              {loading ? "불러오는 중" : "메뉴 더 보기"}
            </ActionButton>
            <span>
              {total}곳 중 {results.length}곳 표시
            </span>
          </div>
        ) : null}
      </div>
    </section>
  )
}
