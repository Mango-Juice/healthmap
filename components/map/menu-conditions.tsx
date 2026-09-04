import type { MenuConditions } from "../../lib/domain/discovery"
import {
  CookingFilterSchema,
  IngredientFilterSchema,
  type PlaceFilter,
  PlaceFilterSchema,
} from "../../lib/domain/filter"
import styles from "./menu-conditions.module.css"

const CATEGORIES = [
  ["all", "전체"],
  ["salad_poke", "샐러드·포케"],
  ["rice", "밥·정식"],
  ["whole_grain", "잡곡·현미"],
  ["plant_based", "채식 표기"],
  ["noodles", "면"],
  ["soup", "국·탕"],
  ["sandwich", "샌드위치"],
  ["main_dish", "주요리"],
] as const
export function MenuConditionControls({
  conditions,
  onChange,
  legacyFacets = [],
}: {
  readonly conditions: MenuConditions
  readonly onChange: (conditions: MenuConditions) => void
  readonly legacyFacets?: readonly { readonly filter: PlaceFilter; readonly count: number }[]
}) {
  return (
    <fieldset className={styles["conditions"]}>
      <legend>메뉴 조건</legend>
      <label>
        식사 형태·선택
        <select
          value={conditions.tag}
          onChange={(event) =>
            onChange({ ...conditions, tag: PlaceFilterSchema.parse(event.currentTarget.value) })
          }
        >
          {CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
          {(
            [
              ["vegetables", "채소"],
              ["protein", "단백질"],
              ["balanced", "균형식"],
            ] as const
          )
            .filter(
              ([value]) =>
                conditions.tag === value ||
                legacyFacets.some((facet) => facet.filter === value && facet.count > 0),
            )
            .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </select>
      </label>
      <label>
        재료
        <select
          value={conditions.ingredient ?? "all"}
          onChange={(event) =>
            onChange({
              ...conditions,
              ingredient: IngredientFilterSchema.parse(event.currentTarget.value),
            })
          }
        >
          <option value="all">재료 전체</option>
          <option value="chicken">닭</option>
          <option value="fish">생선</option>
          <option value="tofu_soy">두부·콩</option>
        </select>
      </label>
      <label>
        조리
        <select
          value={conditions.cooking ?? "all"}
          onChange={(event) =>
            onChange({
              ...conditions,
              cooking: CookingFilterSchema.parse(event.currentTarget.value),
            })
          }
        >
          <option value="all">조리 전체</option>
          <option value="grilled">구이</option>
          <option value="steamed">찜</option>
          <option value="roasted">로스트</option>
        </select>
      </label>
    </fieldset>
  )
}
