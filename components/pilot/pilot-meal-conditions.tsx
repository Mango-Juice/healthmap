import { PILOT_INGREDIENT_FILTERS, type PilotIngredientFilter } from "../../lib/pilot/discovery"
import styles from "./pilot-meal-conditions.module.css"

type Properties = {
  readonly ingredient: PilotIngredientFilter
  readonly onIngredientChange: (value: PilotIngredientFilter) => void
}
export function PilotMealConditions({ ingredient, onIngredientChange }: Properties) {
  return (
    <div className={styles["conditions"]}>
      <label>
        <span className={styles["label"]}>먹고 싶은 재료</span>
        <select
          aria-label="먹고 싶은 재료"
          value={ingredient}
          onChange={(event) => {
            const option = PILOT_INGREDIENT_FILTERS.find(
              (option) => option.value === event.currentTarget.value,
            )
            if (option) onIngredientChange(option.value)
          }}
        >
          {PILOT_INGREDIENT_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
