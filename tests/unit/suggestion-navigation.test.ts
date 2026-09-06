import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import SuggestLoading from "../../app/suggest/loading"

describe("suggestion navigation", () => {
  it("provides an immediate, accessible route loading state", () => {
    const markup = renderToStaticMarkup(SuggestLoading())
    expect(markup).toContain('role="status"')
    expect(markup).toContain("제안 페이지 여는 중")
  })
})
