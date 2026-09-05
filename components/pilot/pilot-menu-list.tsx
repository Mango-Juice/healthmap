"use client"

import { useState } from "react"
import { pilotMenuFactLabel, presentPilotMenuName } from "../../lib/pilot/discovery"
import type { PilotMenuDto } from "../../lib/pilot/dto"
import { PilotCategoryTags } from "./pilot-category-tags"
import styles from "./pilot-discovery.module.css"

type Properties = {
  readonly menus: readonly PilotMenuDto[]
  readonly title: string
}

export function PilotMenuList({ menus, title }: Properties) {
  const [expanded, setExpanded] = useState(false)
  if (menus.length === 0) return null
  const visibleMenus = expanded ? menus : menus.slice(0, 3)
  const hiddenCount = menus.length - visibleMenus.length
  return (
    <section aria-label={title} className={styles["menus"]}>
      <h3>{title}</h3>
      <ul>
        {visibleMenus.map((menu, index) => {
          const facts = pilotMenuFactLabel(menu)
          return (
            <li key={menu.id}>
              <span aria-hidden="true" className={styles["menuIndex"]}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className={styles["menuContent"]}>
                <h4>{presentPilotMenuName(menu.name)}</h4>
                {facts ? (
                  <p className={styles["menuFacts"]}>{facts}</p>
                ) : (
                  <PilotCategoryTags menus={[menu]} />
                )}
                {menu.facts.selection_reasons
                  .filter(
                    (reason, index, reasons) =>
                      presentPilotMenuName(reason.text) !== presentPilotMenuName(menu.name) &&
                      reason.text !== menu.facts.ordering_note &&
                      reasons.findIndex((candidate) => candidate.text === reason.text) === index,
                  )
                  .map((reason) => (
                    <p key={reason.kind}>{reason.text}</p>
                  ))}
                {menu.facts.ordering_note ? (
                  <p className={styles["orderingNote"]}>{menu.facts.ordering_note}</p>
                ) : null}
                {menu.facts.dietary !== "unknown" ? (
                  <p>채식 메뉴로 소개되어 있어요. 재료와 조리 방식은 주문할 때 확인해 주세요.</p>
                ) : null}
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
