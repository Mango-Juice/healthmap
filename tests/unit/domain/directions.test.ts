import { describe, expect, it } from "vitest"
import { buildNaverRouteDirections } from "../../../lib/domain/directions"

describe("production directions boundary", () => {
  it("Given a validated discovery destination, when a route is built, then no stored provider response is required", () => {
    const result = buildNaverRouteDirections({
      latitude: 37.501,
      longitude: 127.033,
      name: "무지개수프",
    })

    expect(result).toEqual({
      kind: "route",
      source: "naver_route",
      url: `https://map.naver.com/index.nhn?elng=127.033&elat=37.501&etext=${encodeURIComponent("무지개수프")}&menu=route`,
    })
  })
})
