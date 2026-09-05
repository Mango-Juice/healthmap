import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import SuggestLoading from "../../app/suggest/loading"

describe("suggestion navigation", () => {
  it("keeps suggestion links eligible for production prefetching", () => {
    for (const path of [
      "components/pilot/pilot-discovery.tsx",
      "components/pilot/pilot-detail.tsx",
    ]) {
      const source = readFileSync(resolve(path), "utf8")
      expect(source).not.toMatch(/href=.*suggest[^>]*prefetch=\{false\}/su)
    }
  })

  it("does not load the 22 MB place snapshot for an unscoped suggestion", () => {
    const source = readFileSync(resolve("app/suggest/page.tsx"), "utf8")
    expect(source).not.toContain('import { readPilotCatalog } from "../../lib/pilot/server"')
    expect(source).toContain('await import("../../lib/pilot/server")')
  })

  it("provides an immediate, accessible route loading state", () => {
    const markup = renderToStaticMarkup(SuggestLoading())
    expect(markup).toContain('role="status"')
    expect(markup).toContain("제안 페이지 여는 중")
  })
})
