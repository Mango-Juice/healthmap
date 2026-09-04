import { describe, expect, it } from "vitest"

import { isPilotEnabled, isPublicPilotEnabled } from "../../lib/pilot/environment"

describe("internal pilot environment", () => {
  it("opens the user-authorized public Pilot only with its explicit flag", () => {
    const environment = { VERCEL_ENV: "production", NODE_ENV: "production" }
    expect(isPublicPilotEnabled(environment)).toBe(false)
    expect(isPilotEnabled({ ...environment, HEALTHMAP_PUBLIC_PILOT: "0" })).toBe(false)
    expect(isPilotEnabled({ ...environment, HEALTHMAP_PUBLIC_PILOT: "1" })).toBe(true)
  })
  it("Given an enabled Preview deployment, When the gate is evaluated, Then pilot access is allowed", () => {
    const enabled = isPilotEnabled({
      HEALTHMAP_PILOT_ENABLED: "1",
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
    })

    expect(enabled).toBe(true)
  })

  it("Given an enabled production deployment, When the gate is evaluated, Then pilot access remains blocked", () => {
    const enabled = isPilotEnabled({
      HEALTHMAP_PILOT_ENABLED: "1",
      NODE_ENV: "production",
      VERCEL_ENV: "production",
    })

    expect(enabled).toBe(false)
  })

  it("Given local development without the explicit flag, When the gate is evaluated, Then pilot access remains blocked", () => {
    const enabled = isPilotEnabled({ NODE_ENV: "development" })

    expect(enabled).toBe(false)
  })
})

it("blocks explicit production hosting even with a development runtime", () => {
  expect(
    isPilotEnabled({
      HEALTHMAP_PILOT_ENABLED: "1",
      VERCEL_ENV: "production",
      NODE_ENV: "development",
    }),
  ).toBe(false)
})
