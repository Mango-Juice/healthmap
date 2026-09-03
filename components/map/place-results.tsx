"use client"

import type { Menu, Place } from "../../lib/domain/catalog"
import type { PlaceDistance } from "../../lib/domain/distance"
import { SearchIcon } from "../ui/health-map-icons"
import { CATEGORY_LABELS } from "../ui/health-map-options"
import styles from "./map-discovery.module.css"
import { MENU_VERIFICATION_LABELS } from "./menu-verification"

type Properties = {
  readonly menus: readonly Menu[]
  readonly onQueryChange: (query: string) => void
  readonly onSearchCommit: () => void
  readonly onSelect: (place: Place, trigger: HTMLElement) => void
  readonly query: string
  readonly results: readonly PlaceDistance[]
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
          <output aria-label="검색 결과 수">{results.length}곳</output>
        </div>
      </header>
      <div className={styles["resultsBody"]}>
        {results.length === 0 ? (
          <div className={styles["noResults"]} role="status">
            <strong>검색 결과가 없습니다.</strong>
            <span>검색어나 건강식 유형, 검색 지역을 바꿔 보세요.</span>
          </div>
        ) : (
          <ol aria-label="검색 결과" className={styles["resultList"]}>
            {results.map(({ distanceMeters, place }) => {
              const placeMenus = validMenusForPlace(menus, place)
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
                        {distanceLabel(distanceMeters)}
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
                        {place.healthTags.map((tag) => CATEGORY_LABELS[tag]).join(" · ")}
                      </span>
                      {representativeMenu ? (
                        <small>
                          {MENU_VERIFICATION_LABELS[representativeMenu.verificationMethod]} ·{" "}
                          {representativeMenu.verifiedAt} 확인
                        </small>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
