import type { Route } from "@playwright/test"

import { PilotPlacesResponseSchema } from "../../lib/pilot/dto"
import {
  assertPrivateTransport,
  installAnalyticsInterceptor,
  recordAnalyticsTransport,
  waitForEvent,
} from "./analytics-transport"
import { expect, test } from "./map-test"

export const registerPilotAnalyticsAdversarialTests = (): void => {
  test("latest search response wins when two requests settle in reverse order", async ({
    page,
  }) => {
    const transport = await installAnalyticsInterceptor(page)
    let releaseStale: (() => void) | undefined
    const staleReleased = new Promise<void>((resolve) => {
      releaseStale = resolve
    })
    let markStaleStarted: (() => void) | undefined
    const staleStarted = new Promise<void>((resolve) => {
      markStaleStarted = resolve
    })
    await page.route("**/api/places?**", async (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.get("mode") !== "places") return route.continue()
      if (url.searchParams.get("query") === "샐러드") {
        markStaleStarted?.()
        await staleReleased
      }
      return route.continue()
    })
    await page.goto("/")
    await expect(page.locator("[data-pilot-place-id]").first()).toBeAttached()
    const initialSearchResults = transport.events.filter(
      ({ event, properties }) =>
        event === "catalog_result_received" && properties["query_kind"] === "search",
    ).length
    const search = page.getByRole("searchbox", { name: "가게나 메뉴 검색" })

    await search.fill("샐러드")
    await staleStarted
    await search.fill("무지개 한그릇 연구소")
    await expect(page.getByLabel("검색 결과 수")).toHaveText("1곳 중 1곳")
    releaseStale?.()
    await waitForEvent(transport.events, "catalog_result_received", {
      query_kind: "search",
      filter: "all",
      result_count_bucket: "1_5",
    })

    expect(
      transport.events.filter(
        ({ event, properties }) =>
          event === "catalog_result_received" && properties["query_kind"] === "search",
      ).length,
    ).toBe(initialSearchResults + 1)
    assertPrivateTransport(transport.events, transport.rawRequests)
  })

  test("pagination does not emit another completed first-page result", async ({ page }) => {
    const transport = await installAnalyticsInterceptor(page)
    await page.route("**/api/places?**", async (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.get("mode") !== "places" || url.searchParams.has("query"))
        return route.continue()
      const upstreamUrl = new URL(url)
      upstreamUrl.searchParams.delete("cursor")
      const response = await route.fetch({ url: upstreamUrl.toString() })
      const pageResponse = PilotPlacesResponseSchema.parse(await response.json())
      const paginated = url.searchParams.has("cursor")
        ? { ...pageResponse, results: pageResponse.results.slice(1), nextCursor: null }
        : { ...pageResponse, results: pageResponse.results.slice(0, 1), nextCursor: "qa-page-2" }
      await route.fulfill({ status: 200, contentType: "application/json", json: paginated })
    })
    await page.goto("/")
    await expect(page.getByRole("button", { name: "장소 더 보기" })).toBeVisible()
    await waitForEvent(transport.events, "catalog_result_received", {
      query_kind: "browse",
      filter: "all",
      result_count_bucket: "1_5",
    })
    const firstPageEvents = transport.events.filter(
      ({ event }) => event === "catalog_result_received",
    ).length

    await page.getByRole("button", { name: "장소 더 보기" }).click()
    await expect(page.getByRole("button", { name: "장소 더 보기" })).toHaveCount(0)

    expect(transport.events.filter(({ event }) => event === "catalog_result_received").length).toBe(
      firstPageEvents,
    )
    expect(transport.events.filter(({ event }) => event === "catalog_request_failed")).toHaveLength(
      0,
    )
    assertPrivateTransport(transport.events, transport.rawRequests)
  })

  test("first-page provider failures use bounded reasons and leave retry usable", async ({
    page,
  }) => {
    const transport = await installAnalyticsInterceptor(page)
    let attempt = 0
    await page.route("**/api/places?**", async (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.get("mode") !== "places" || url.searchParams.get("query") !== "실패")
        return route.continue()
      attempt += 1
      if (attempt === 1) return route.fulfill({ status: 503, body: "unavailable" })
      if (attempt === 2)
        return route.fulfill({ status: 200, contentType: "application/json", body: "{" })
      if (attempt === 3) return route.abort("failed")
      return route.continue()
    })
    await page.goto("/")
    await expect(page.locator("[data-pilot-place-id]").first()).toBeAttached()
    await page.getByRole("searchbox", { name: "가게나 메뉴 검색" }).fill("실패")

    for (const reason of ["http", "invalid_response", "network"] as const) {
      await expect(page.getByRole("button", { name: "장소 다시 불러오기" })).toBeVisible()
      await waitForEvent(transport.events, "catalog_request_failed", {
        query_kind: "search",
        reason,
      })
      await page.getByRole("button", { name: "장소 다시 불러오기" }).click()
    }
    await expect(page.getByLabel("검색 결과 수")).toHaveText("0곳 중 0곳")
    await waitForEvent(transport.events, "catalog_result_received", {
      query_kind: "search",
      filter: "all",
      result_count_bucket: "0",
    })

    expect(transport.events.filter(({ event }) => event === "catalog_request_failed")).toHaveLength(
      3,
    )
    assertPrivateTransport(transport.events, transport.rawRequests)
  })

  test("opt-out during a request prevents retroactive result replay", async ({ page }) => {
    const transport = await installAnalyticsInterceptor(page)
    let pendingRoute: Route | undefined
    let markStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    await page.route("**/api/places?**", async (route) => {
      const url = new URL(route.request().url())
      if (
        url.searchParams.get("mode") === "places" &&
        url.searchParams.get("query") === "무지개 한그릇 연구소"
      ) {
        pendingRoute = route
        markStarted?.()
        return
      }
      return route.continue()
    })
    await page.goto("/")
    await expect(page.locator("[data-pilot-place-id]").first()).toBeAttached()
    const searchResultsBefore = transport.events.filter(
      ({ event, properties }) =>
        event === "catalog_result_received" && properties["query_kind"] === "search",
    ).length
    const search = page.getByRole("searchbox", { name: "가게나 메뉴 검색" })

    await search.fill("무지개 한그릇 연구소")
    await started
    await page.evaluate(() => localStorage.setItem("healthmap.analytics.opt-out.v1", "true"))
    await pendingRoute?.continue()
    await expect(page.getByLabel("검색 결과 수")).toHaveText("1곳 중 1곳")
    await page.evaluate(() => localStorage.setItem("healthmap.analytics.opt-out.v1", "false"))
    expect(
      transport.events.filter(
        ({ event, properties }) =>
          event === "catalog_result_received" && properties["query_kind"] === "search",
      ).length,
    ).toBe(searchResultsBefore)
    await search.fill("샐러드")
    await expect
      .poll(
        () =>
          transport.events.filter(
            ({ event, properties }) =>
              event === "catalog_result_received" && properties["query_kind"] === "search",
          ).length,
      )
      .toBe(searchResultsBefore + 1)
    assertPrivateTransport(transport.events, transport.rawRequests)
  })

  test("blocked storage suppresses analytics without breaking catalog results", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new DOMException("blocked", "SecurityError")
      }
      Storage.prototype.setItem = () => {
        throw new DOMException("blocked", "SecurityError")
      }
    })
    const transport = await recordAnalyticsTransport(page)

    await page.goto("/")
    await expect(page.locator("[data-pilot-place-id]").first()).toBeAttached()
    await page.getByRole("searchbox", { name: "가게나 메뉴 검색" }).fill("무지개 한그릇 연구소")
    await expect(page.getByLabel("검색 결과 수")).toHaveText("1곳 중 1곳")

    expect(transport.events).toHaveLength(0)
    expect(transport.rawRequests).toHaveLength(0)
  })
}
