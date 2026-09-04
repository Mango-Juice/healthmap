"use client"

import type { PublicRegion } from "../../lib/catalog/query-contract"
import type { Menu, Place } from "../../lib/domain/catalog"
import { type MenuConditions, matchingDiscoveryMenus } from "../../lib/domain/discovery"
import type { PlaceDistance } from "../../lib/domain/distance"
import type { PlaceFilter } from "../../lib/domain/filter"
import type { ViewportBounds } from "../../lib/domain/viewport"
import { SearchIcon } from "../ui/health-map-icons"
import styles from "./map-discovery.module.css"
import { MenuConditionControls } from "./menu-conditions"
import conditionStyles from "./menu-conditions.module.css"
import { menuApplicabilityNotice, menuCategoryLabels, menuReasons } from "./menu-fact-presentation"

type Properties = {
  readonly menus: readonly Menu[]
  readonly onQueryChange: (query: string) => void
  readonly onSearchCommit: () => void
  readonly onSelect: (place: Place, trigger: HTMLElement) => void
  readonly query: string
  readonly results: readonly PlaceDistance[]
  readonly conditions: MenuConditions
  readonly onConditionsChange?: ((value: MenuConditions) => void) | undefined
  readonly regions: readonly PublicRegion[]
  readonly onRegionSelect: (bounds: ViewportBounds) => void
  readonly total: number
  readonly legacyFacets: readonly { readonly filter: PlaceFilter; readonly count: number }[]
  readonly distanceFromUser: boolean
  readonly onRegionReset: () => void
  readonly loadMore: (() => void) | undefined
}

const validMenusForPlace = (menus: readonly Menu[], place: Place): readonly Menu[] => {
  const today = new Date().toISOString().slice(0, 10)
  return menus
    .filter((menu) => menu.placeId === place.id && menu.published && menu.validUntil >= today)
    .sort((left, right) => left.displayOrder - right.displayOrder)
}

const neighborhood = (address: string): string => address.split(/\s+/u)[1] ?? address
const distanceLabel = (distanceMeters: number): string =>
  distanceMeters < 1000
    ? `${Math.round(distanceMeters / 10) * 10}m`
    : `${(distanceMeters / 1000).toFixed(1)}km`

export function PlaceResults({
  menus,
  onQueryChange,
  onSearchCommit,
  onSelect,
  query,
  results,
  conditions,
  onConditionsChange,
  regions,
  onRegionSelect,
  total,
  legacyFacets,
  distanceFromUser,
  onRegionReset,
  loadMore,
}: Properties) {
  return (
    <section aria-labelledby="results-heading" className={styles["results"]}>
      <header className={styles["resultsHeader"]}>
        <form
          className={styles["search"]}
          onSubmit={(event) => {
            event.preventDefault()
            onSearchCommit()
          }}
        >
          <label className={styles["searchField"]}>
            <span className={styles["visuallyHidden"]}>장소와 메뉴 검색</span>
            <SearchIcon />
            <input
              aria-label="장소와 메뉴 검색"
              onChange={(event) => onQueryChange(event.currentTarget.value)}
              placeholder="장소, 동네, 메뉴 검색"
              type="search"
              value={query}
            />
          </label>
        </form>
        <div className={styles["resultsTitle"]}>
          <h2 id="results-heading">검색 결과</h2>
          <output aria-label="검색 결과 수">
            {results.length === total ? `${total}곳` : `전체 ${total}곳 · ${results.length}곳 표시`}
          </output>
        </div>
      </header>
      <div className={styles["resultsBody"]}>
        {onConditionsChange ? (
          <button className={styles["resultCard"]} onClick={onRegionReset} type="button">
            전국 지역 보기
          </button>
        ) : null}
        {onConditionsChange ? (
          <MenuConditionControls
            conditions={conditions}
            onChange={onConditionsChange}
            legacyFacets={legacyFacets}
          />
        ) : null}
        {regions.length > 0 ? (
          <fieldset className={conditionStyles["conditions"]}>
            <legend>지역 선택</legend>
            <label>
              지역
              <select
                aria-label="지역 선택"
                value=""
                onChange={(event) => {
                  const region = regions.find((value) => value.id === event.currentTarget.value)
                  if (region) onRegionSelect(region.bounds)
                }}
              >
                <option value="">지역을 선택해 주세요</option>
                {regions.map((region) => (
                  <option value={region.id} key={region.id}>
                    {region.label} · {region.count}곳
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        ) : null}
        {results.length === 0 ? (
          <div className={styles["noResults"]} role="status">
            <strong>
              {regions.length > 0 ? "찾을 지역을 선택해 주세요." : "검색 결과가 없습니다."}
            </strong>
            <span>
              {regions.length > 0
                ? "지역을 선택하거나 장소·메뉴를 검색해 주세요."
                : "아직 모든 장소를 담지는 못했어요. 검색어, 메뉴 조건이나 지역을 바꿔 보세요."}
            </span>
          </div>
        ) : (
          <ol aria-label="검색 결과" className={styles["resultList"]}>
            {results.map(({ distanceMeters, place }) => {
              const placeMenus = matchingDiscoveryMenus({
                place,
                menus: validMenusForPlace(menus, place),
                ...conditions,
              })
              const representativeMenu = placeMenus[0]
              return (
                <li key={place.id}>
                  <button
                    aria-label={`${place.name} 상세 보기`}
                    className={styles["resultCard"]}
                    data-place-slug={place.slug}
                    onClick={(event) => onSelect(place, event.currentTarget)}
                    type="button"
                  >
                    <span className={styles["resultIdentity"]}>
                      <strong>{place.name}</strong>
                      <span className={styles["resultDistance"]}>
                        {distanceFromUser ? `직선 ${distanceLabel(distanceMeters)}` : ""}
                      </span>
                    </span>
                    <span className={styles["resultLocation"]}>{neighborhood(place.address)}</span>
                    {representativeMenu ? (
                      <span className={styles["resultMenu"]}>
                        <small>대표 메뉴</small>
                        <b>
                          {representativeMenu.name}
                          {placeMenus.length > 1 ? ` 외 ${placeMenus.length - 1}개` : ""}
                        </b>
                      </span>
                    ) : null}
                    <span className={styles["resultEvidence"]}>
                      <span className={styles["cardTags"]}>
                        {menuCategoryLabels(place, placeMenus)}
                      </span>
                      {representativeMenu ? (
                        <small>{menuReasons(representativeMenu)[0]}</small>
                      ) : null}
                    </span>
                    {representativeMenu && menuApplicabilityNotice(representativeMenu) ? (
                      <span className={styles["resultLocation"]}>
                        {menuApplicabilityNotice(representativeMenu)}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ol>
        )}
        {loadMore ? (
          <button className={styles["resultCard"]} onClick={loadMore} type="button">
            더 보기 · {results.length}/{total}곳
          </button>
        ) : null}
      </div>
    </section>
  )
}
