import { SearchIcon } from "../ui/health-map-icons"
import shared from "./food-map-discovery.module.css"
import styles from "./food-map-search-controls.module.css"

type Properties = {
  readonly query: string
  readonly onQueryChange: (query: string) => void
}

export function FoodMapSearchControls({ query, onQueryChange }: Properties) {
  return (
    <div className={styles["controls"]}>
      <label className={shared["search"]}>
        <SearchIcon />
        <span className={shared["visuallyHidden"]}>가게나 메뉴 검색</span>
        <span className={styles["inputFrame"]}>
          <input
            aria-label="가게나 메뉴 검색"
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
            enterKeyHint="search"
            placeholder="가게·메뉴 검색"
            type="search"
            value={query}
          />
        </span>
      </label>
    </div>
  )
}
