import { describe, expect, it } from "vitest"
import { MenuIdSchema } from "../../lib/domain/contracts"
import { PilotMediaSchema } from "../../lib/pilot/facts"
import { selectPilotMedia } from "../../lib/pilot/projection"

const matchingMenuId = MenuIdSchema.parse("11111111-1111-5111-8111-111111111111")

const menuPhoto = PilotMediaSchema.parse({
  url: "https://www.salady.com/data/menu/fixture.jpg",
  alt: "연어 포케",
  sourceUrl: "https://www.salady.com/menu/view_1?idx=1",
  scope: "brand",
  usageApproved: true,
  subject: "menu",
  menuIds: [matchingMenuId],
  attribution: "Salady official menu",
})
const otherMenuPhoto = PilotMediaSchema.parse({
  ...menuPhoto,
  url: "https://www.salady.com/data/menu/other.jpg",
  menuIds: ["22222222-2222-5222-8222-222222222222"],
})
const venuePhoto = PilotMediaSchema.parse({
  ...menuPhoto,
  url: "https://www.salady.com/data/store/venue.jpg",
  scope: "place",
  subject: "venue",
  menuIds: [],
})

describe("Pilot media selection", () => {
  it("selects the currently matching menu photo before a venue photo", () => {
    expect(selectPilotMedia([venuePhoto, otherMenuPhoto, menuPhoto], [matchingMenuId])?.url).toBe(
      menuPhoto.url,
    )
  })

  it("never selects a dish photo belonging to another matching result", () => {
    expect(selectPilotMedia([otherMenuPhoto, venuePhoto], [matchingMenuId])?.url).toBe(
      venuePhoto.url,
    )
  })

  it("renders no media choice when only a wrong-menu dish exists", () => {
    expect(selectPilotMedia([otherMenuPhoto], [matchingMenuId])).toBeUndefined()
  })
})
