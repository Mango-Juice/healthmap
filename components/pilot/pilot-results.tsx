import type { PilotCatalog, PilotPlace } from "../../lib/pilot/catalog"
import {
  menusForPilotPlace,
  type PilotDiscoveryFilter,
  presentPilotMenuName,
} from "../../lib/pilot/discovery"
import { ChevronRightIcon, SearchIcon } from "../ui/health-map-icons"
import { PilotCategoryTags } from "./pilot-category-tags"
import styles from "./pilot-discovery.module.css"
import { PilotFilters } from "./pilot-filters"

type Properties = {
  readonly catalog: PilotCatalog
  readonly filter: PilotDiscoveryFilter
  readonly onFilterChange: (filter: PilotDiscoveryFilter) => void
  readonly onQueryChange: (query: string) => void
  readonly onSelect: (id: PilotPlace["id"], trigger: HTMLButtonElement) => void
  readonly places: readonly PilotPlace[]
  readonly query: string
}

export function PilotResults({
  catalog,
  filter,
  onFilterChange,
  onQueryChange,
  onSelect,
  places,
  query,
}: Properties) {
  return (
    <section className={styles["results"]}>
      <header className={styles["resultsHeader"]}>
        <label className={styles["search"]}>
          <SearchIcon />
          <span className={styles["visuallyHidden"]}>가게나 메뉴 검색</span>
          <input
            aria-label="가게나 메뉴 검색"
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder="가게·메뉴 검색"
            type="search"
            value={query}
          />
        </label>
        <PilotFilters onSelect={onFilterChange} selected={filter} />
        <div className={styles["resultsMeta"]}>
          <strong>검색 결과</strong>
          <output aria-label="검색 결과 수">{places.length}곳</output>
        </div>
      </header>
      <div className={styles["scrollBody"]}>
        {places.length === 0 ? (
          <div className={styles["empty"]} role="status">
            <strong>조건에 맞는 곳이 아직 없어요.</strong>
            <span>검색어나 건강식 유형을 바꿔 보세요.</span>
          </div>
        ) : (
          <ol aria-label="건강식 검색 결과" className={styles["list"]}>
            {places.map((place) => {
              const menus = menusForPilotPlace(catalog, place.id)
              return (
                <li key={place.id}>
                  <button
                    aria-label={`${place.name} 자세히 보기`}
                    data-pilot-place-id={place.id}
                    onClick={(event) => onSelect(place.id, event.currentTarget)}
                    type="button"
                  >
                    <span className={styles["cardHeading"]}>
                      <strong>{place.name}</strong>
                      <ChevronRightIcon />
                    </span>
                    <PilotCategoryTags place={place} />
                    <span className={styles["menuPreview"]}>
                      {menus[0] ? presentPilotMenuName(menus[0].name) : null}
                      {menus.length > 1 ? <small> 외 {menus.length - 1}개 메뉴</small> : null}
                    </span>
                    <span className={styles["address"]}>{place.address}</span>
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
