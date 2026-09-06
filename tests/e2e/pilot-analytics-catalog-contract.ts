import type { Page } from "@playwright/test"

import {
  assertPrivateTransport,
  installAnalyticsInterceptor,
  waitForEvent,
} from "./analytics-transport"
import { expect, test } from "./map-test"

const resultCountBucket = (count: number): "0" | "1_5" | "6_20" | "21_plus" => {
  if (count === 0) return "0"
  if (count <= 5) return "1_5"
  if (count <= 20) return "6_20"
  return "21_plus"
}

const visibleTotal = async (page: Page): Promise<number> => {
  const label = await page.getByLabel("검색 결과 수").textContent()
  const match = label?.match(/^(\d+)곳 중/u)
  if (match === null || match === undefined) throw new TypeError("expected a settled result count")
  return Number(match[1])
}

export const registerPilotCatalogAnalyticsContractTest = (): void => {
  test("current root sends one private event for each deliberate discovery action", async ({
    page,
  }) => {
    const transport = await installAnalyticsInterceptor(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto("/")

    await waitForEvent(transport.events, "map_viewed", { source: "direct" })
    await waitForEvent(transport.events, "location_resolved", { outcome: "resolved" })
    await expect
      .poll(
        () => transport.events.filter(({ event }) => event === "catalog_result_received").length,
      )
      .toBe(1)
    expect(
      transport.events.filter(({ event }) => event === "catalog_result_received").at(-1)
        ?.properties,
    ).toEqual({
      query_kind: "browse",
      filter: "all",
      result_count_bucket: resultCountBucket(await visibleTotal(page)),
    })
    expect(transport.events.filter(({ event }) => event === "map_viewed")).toHaveLength(1)
    await page.getByRole("button", { name: /검색 결과 .*펼치기/u }).click()
    await waitForEvent(transport.events, "result_list_opened", {})

    for (const [label, filter] of [
      ["채식 메뉴 필터", "plant_based"],
      ["샐러드·포케 필터", "salad_poke"],
      ["구이·찜 필터", "grilled_steamed"],
      ["잡곡·현미 필터", "whole_grain"],
      ["밥·도시락 필터", "rice"],
      ["전체 필터", "all"],
    ] as const) {
      const resultEventCount = transport.events.filter(
        ({ event }) => event === "catalog_result_received",
      ).length
      await page.getByRole("button", { name: label }).click()
      await expect
        .poll(
          () => transport.events.filter(({ event }) => event === "catalog_result_received").length,
        )
        .toBe(resultEventCount + 1)
      expect(
        transport.events.filter(({ event }) => event === "catalog_result_received").at(-1)
          ?.properties,
      ).toEqual({
        query_kind: "browse",
        filter,
        result_count_bucket: resultCountBucket(await visibleTotal(page)),
      })
    }

    const search = page.getByRole("searchbox", { name: "가게나 메뉴 검색" })
    await search.fill("  무지개 한그릇 연구소  ")
    await expect(page.getByLabel("검색 결과 수")).toHaveText("1곳 중 1곳")
    await waitForEvent(transport.events, "search_used", { result_count_bucket: "1_5" })
    await waitForEvent(transport.events, "catalog_result_received", {
      query_kind: "search",
      filter: "all",
      result_count_bucket: "1_5",
    })
    await search.fill("결과가없는검색어")
    await expect(page.getByLabel("검색 결과 수")).toHaveText("0곳 중 0곳")
    await waitForEvent(transport.events, "catalog_result_received", {
      query_kind: "search",
      filter: "all",
      result_count_bucket: "0",
    })
    await search.fill("무지개 한그릇 연구소")
    await expect(page.getByLabel("검색 결과 수")).toHaveText("1곳 중 1곳")

    const result = page.locator("[data-pilot-place-id]").first()
    const placeId = await result.getAttribute("data-pilot-place-id")
    if (placeId === null) throw new TypeError("expected stable place ID")
    await result.click()
    await waitForEvent(transport.events, "place_opened", { place_id: placeId, source: "list" })
    const popup = page.waitForEvent("popup")
    await page.getByRole("link", { name: /길찾기/u }).click()
    await (await popup).close()
    await waitForEvent(transport.events, "directions_opened", {
      place_id: placeId,
      source: "naver_route",
    })
    assertPrivateTransport(transport.events, transport.rawRequests)
  })
}
