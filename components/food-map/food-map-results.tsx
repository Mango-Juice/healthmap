import type { ReactNode, RefObject } from "react"
import type {
  DiscoveryPlaceDto as DiscoveryPlace,
  DiscoveryPlaceResultDto as DiscoveryResult,
} from "../../lib/discovery/dto"
import {
  type DiscoveryFilter,
  type DiscoveryIngredientFilter,
  presentDiscoveryMenuName,
} from "../../lib/discovery/menu-selection"
import { haversineDistanceMeters } from "../../lib/domain/distance"
import type { GeoPoint } from "../../lib/domain/geo"
import { ChevronRightIcon } from "../ui/health-map-icons"
import { ActionButton } from "../ui/health-map-primitives"
import { FoodMapCategoryTags } from "./food-map-category-tags"
import styles from "./food-map-discovery.module.css"
import { FoodMapLoadingStatus } from "./food-map-loading-status"
import { FoodMapThumbnail } from "./food-map-thumbnail"

type Properties = {
  readonly sortBasis: "map_center" | "region_center" | "catalog_center" | undefined
  readonly sortOrigin: GeoPoint | null | undefined
  readonly total: number
  readonly loading: boolean
  readonly failed: boolean
  readonly onRetry: () => void
  readonly onLoadMore: (() => void) | undefined
  readonly filter: DiscoveryFilter
  readonly ingredient: DiscoveryIngredientFilter
  readonly onFilterChange: (filter: DiscoveryFilter) => void
  readonly onIngredientChange: (filter: DiscoveryIngredientFilter) => void
  readonly onQueryChange: (query: string) => void
  readonly onClearArea: (() => void) | undefined
  readonly onSelect: (id: DiscoveryPlace["id"], trigger: HTMLButtonElement) => void
  readonly results: readonly DiscoveryResult[]
  readonly query: string
  readonly emptyHeadingRef?: RefObject<HTMLElement | null> | undefined
  readonly recovery?: ReactNode | undefined
  readonly headingRef?: RefObject<HTMLHeadingElement | null> | undefined
  readonly scrollRef?: RefObject<HTMLDivElement | null> | undefined
}

export function FoodMapResults({
  sortBasis,
  sortOrigin,
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
  emptyHeadingRef,
  recovery,
  headingRef,
  scrollRef,
}: Properties) {
  return (
    <section className={styles["results"]}>
      <header className={styles["resultsHeader"]}>
        <h2 className={styles["resultsTitle"]} ref={headingRef} tabIndex={-1}>
          검색 결과
        </h2>
        <div className={styles["resultsMeta"]}>
          <output aria-label="검색 결과 수" aria-live="polite">
            {loading ? "찾는 중" : `${total}곳 중 ${results.length}곳`}
          </output>
        </div>
      </header>
      <div className={styles["scrollBody"]} ref={scrollRef}>
        {failed && results.length === 0 ? (
          <div className={styles["empty"]} role="alert">
            <strong>장소를 불러오지 못했어요.</strong>
            <ActionButton onClick={onRetry} variant="secondary">
              장소 다시 불러오기
            </ActionButton>
          </div>
        ) : loading && results.length === 0 ? (
          <div className={styles["empty"]}>
            <FoodMapLoadingStatus label="장소를 찾고 있어요." />
          </div>
        ) : results.length === 0 && recovery !== undefined ? (
          recovery
        ) : results.length === 0 ? (
          <div className={styles["empty"]} role="status">
            <strong ref={emptyHeadingRef} tabIndex={-1}>
              이 조건에서 찾은 곳이 없어요.
            </strong>
            <span>검색어나 메뉴 조건을 바꿔보세요.</span>
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
              const distance = sortOrigin
                ? haversineDistanceMeters(sortOrigin, place) / 1000
                : undefined
              const distanceBasis =
                sortBasis === "map_center"
                  ? "지도 중심"
                  : sortBasis === "region_center"
                    ? "선택 지역 중심"
                    : "검색 결과 중심"
              return (
                <li key={place.id}>
                  <button
                    aria-label={`${place.name} 자세히 보기`}
                    data-food-map-place-id={place.id}
                    onClick={(event) => onSelect(place.id, event.currentTarget)}
                    type="button"
                  >
                    <FoodMapThumbnail result={result} />
                    <span className={styles["cardHeading"]}>
                      <strong>{place.name}</strong>
                      <ChevronRightIcon />
                    </span>
                    <span className={styles["cardLocation"]}>
                      {distance !== undefined ? (
                        <span className={styles["distance"]}>
                          {distanceBasis}에서 직선 {distance.toFixed(1)}km
                        </span>
                      ) : null}
                      <span className={styles["cardAddress"]} title={place.address}>
                        {place.address}
                      </span>
                    </span>
                    {place.listingKind === "store_only" ? (
                      <span className={styles["cardSummary"]}>
                        <span className={styles["menuPreview"]}>{place.storeDescription}</span>
                        <small>메뉴 정보 미확인</small>
                      </span>
                    ) : (
                      <span className={styles["cardSummary"]}>
                        <span className={styles["menuPreview"]}>
                          {first ? presentDiscoveryMenuName(first.name) : null}
                          {menus.length > 1 ? <small> 외 {menus.length - 1}가지</small> : null}
                        </span>
                        <FoodMapCategoryTags menus={first ? [first] : []} />
                      </span>
                    )}
                    {first?.facts.ordering_note ? (
                      <span className={styles["cardNotices"]}>{first.facts.ordering_note}</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ol>
        )}
        {failed && results.length > 0 ? (
          <div className={styles["pagination"]} role="alert">
            <span>다음 장소를 불러오지 못했어요.</span>
            <ActionButton onClick={onRetry} variant="secondary">
              장소 다시 불러오기
            </ActionButton>
          </div>
        ) : null}
        {onLoadMore && !failed ? (
          <div className={styles["pagination"]}>
            <ActionButton onClick={onLoadMore} disabled={loading} variant="secondary">
              {loading ? <FoodMapLoadingStatus label="불러오는 중" /> : "장소 더 보기"}
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
