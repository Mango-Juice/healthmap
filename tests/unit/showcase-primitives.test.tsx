import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  ActionButton,
  FilterRail,
  MapMarker,
  StatusAlert,
} from "../../components/ui/health-map-primitives"

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

  it("Given a selected filter, When rendered, Then exactly one filter is pressed", () => {
    // Given / When
    const markup = renderToStaticMarkup(<FilterRail selected="protein" />)

    // Then
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(markup).toContain("단백질")
  })

  it("Given a category marker, When rendered, Then place and category are named", () => {
    // Given / When
    const markup = renderToStaticMarkup(
      <MapMarker category="vegetables" label="그린테이블 강남점" />,
    )

    // Then
    expect(markup).toContain('aria-label="그린테이블 강남점, 채소"')
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
