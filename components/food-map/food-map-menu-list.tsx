"use client"

import { useState } from "react"
import type { DiscoveryMenuDto } from "../../lib/discovery/dto"
import {
  discoveryMenuDietaryNote,
  discoveryMenuFactLabel,
  presentDiscoveryMenuName,
} from "../../lib/discovery/menu-selection"
import { FoodMapCategoryTags } from "./food-map-category-tags"
import styles from "./food-map-discovery.module.css"

type Properties = {
  readonly menus: readonly DiscoveryMenuDto[]
  readonly title: string
}

export function FoodMapMenuList({ menus, title }: Properties) {
  const [expanded, setExpanded] = useState(false)
  if (menus.length === 0) return null
  const visibleMenus = expanded ? menus : menus.slice(0, 3)
  const hiddenCount = menus.length - visibleMenus.length
  return (
    <section aria-label={title} className={styles["menus"]}>
      <h3>{title}</h3>
      <ul>
        {visibleMenus.map((menu, index) => {
          const facts = discoveryMenuFactLabel(menu)
          const dietaryNote = discoveryMenuDietaryNote(menu.facts.dietary)
          return (
            <li key={menu.id}>
              <span aria-hidden="true" className={styles["menuIndex"]}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className={styles["menuContent"]}>
                <h4>{presentDiscoveryMenuName(menu.name)}</h4>
                {facts ? (
                  <p className={styles["menuFacts"]}>{facts}</p>
                ) : (
                  <FoodMapCategoryTags menus={[menu]} />
                )}
                {menu.facts.selection_reasons
                  .filter(
                    (reason, index, reasons) =>
                      presentDiscoveryMenuName(reason.text) !==
                        presentDiscoveryMenuName(menu.name) &&
                      reason.text !== menu.facts.ordering_note &&
                      reasons.findIndex((candidate) => candidate.text === reason.text) === index,
                  )
                  .map((reason) => (
                    <p key={reason.kind}>{reason.text}</p>
                  ))}
                {menu.facts.ordering_note ? (
                  <p className={styles["orderingNote"]}>{menu.facts.ordering_note}</p>
                ) : null}
                {dietaryNote ? <p>{dietaryNote}</p> : null}
              </div>
            </li>
          )
        })}
      </ul>
      {hiddenCount > 0 ? (
        <button className={styles["menuExpand"]} onClick={() => setExpanded(true)} type="button">
          메뉴 {hiddenCount}개 더 보기
        </button>
      ) : null}
    </section>
  )
}
