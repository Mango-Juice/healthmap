import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ActionButton, StatusAlert } from "../../components/ui/health-map-primitives"

describe("health map primitives", () => {
  it("Given a loading action, When rendered, Then busy and disabled semantics preserve its label", () => {
    // Given / When
    const markup = renderToStaticMarkup(
      <ActionButton loading variant="primary">
        길찾기
      </ActionButton>,
    )

    // Then
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain("disabled")
    expect(markup).toContain("길찾기")
  })

  it("Given an error alert, When rendered, Then assistive technology receives an alert", () => {
    // Given / When
    const markup = renderToStaticMarkup(
      <StatusAlert
        description="네트워크 상태를 확인해 주세요."
        title="지도를 불러오지 못했어요."
        tone="error"
      />,
    )

    // Then
    expect(markup).toContain('role="alert"')
  })
})
