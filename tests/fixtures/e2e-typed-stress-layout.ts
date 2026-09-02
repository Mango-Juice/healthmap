import type { Page } from "@playwright/test"

type TypedStressLayout = {
  readonly detailFits: boolean
  readonly documentFits: boolean
  readonly owners: readonly string[]
}

export const measureTypedStressLayout = async (page: Page): Promise<TypedStressLayout> =>
  page.evaluate(() => {
    const detailBody = document.querySelector<HTMLElement>("[data-testid='place-detail-body']")
    if (detailBody === null) throw new Error("place detail body missing")
    const owners = Array.from(document.querySelectorAll<HTMLElement>("*"))
      .filter((element) => element.getClientRects().length > 0)
      .filter((element) => element.scrollHeight > element.clientHeight + 1)
      .filter((element) => ["auto", "scroll"].includes(getComputedStyle(element).overflowY))
      .map((element) => element.dataset["testid"] ?? element.tagName.toLowerCase())
    return {
      detailFits: detailBody.scrollWidth <= detailBody.clientWidth,
      documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      owners,
    }
  })
