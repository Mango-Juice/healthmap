import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../components/pilot/pilot-discovery", () => ({
  FoodMap: () => createElement("section", { "data-food-map": "true" }),
}))

import HomePage from "../../app/page"
import nextConfig from "../../next.config"

afterEach(() => vi.unstubAllEnvs())
describe("one root map", () => {
  it("renders the current map without Pilot flags or catalog credentials", () => {
    vi.stubEnv("HEALTHMAP_PUBLIC_PILOT", "0")
    vi.stubEnv("HEALTHMAP_PILOT_ENABLED", "0")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
    expect(renderToStaticMarkup(HomePage())).toContain('data-food-map="true"')
  })
  it("does not register compatibility redirects for retired routes", () => {
    expect(Object.hasOwn(nextConfig, "redirects")).toBe(false)
  })
})
