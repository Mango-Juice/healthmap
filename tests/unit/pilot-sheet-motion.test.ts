import { describe, expect, it } from "vitest"
import { choosePilotSheetExpanded } from "../../components/pilot/use-pilot-sheet-motion"

describe("Pilot sheet snap selection", () => {
  it("Given measured two-stop drawer geometry, When a release lands closest to the expanded stop, Then it expands", () => {
    expect(choosePilotSheetExpanded({ collapsedOffset: 216, offset: 72, velocity: 0 })).toBe(true)
  })

  it("Given measured two-stop drawer geometry, When a qualified vertical release has velocity, Then it chooses that direction", () => {
    expect(choosePilotSheetExpanded({ collapsedOffset: 216, offset: 148, velocity: -0.5 })).toBe(
      true,
    )
    expect(choosePilotSheetExpanded({ collapsedOffset: 216, offset: 72, velocity: 0.5 })).toBe(
      false,
    )
  })
})
