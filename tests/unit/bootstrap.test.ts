import { describe, expect, it } from "vitest"

import {
  getMissingPublicEnvironmentNames,
  PUBLIC_ENVIRONMENT_NAMES,
} from "../../app/public-environment"

describe("public environment bootstrap", () => {
  it("Given no public environment, When configuration is inspected, Then every required name is reported", () => {
    const environment = {}

    const missingEnvironmentNames = getMissingPublicEnvironmentNames(environment)

    expect(missingEnvironmentNames).toEqual(PUBLIC_ENVIRONMENT_NAMES)
  })

  it("Given complete public environment, When configuration is inspected, Then no names are reported", () => {
    const environment = Object.fromEntries(
      PUBLIC_ENVIRONMENT_NAMES.map((name) => [name, "configured"]),
    )

    const missingEnvironmentNames = getMissingPublicEnvironmentNames(environment)

    expect(missingEnvironmentNames).toEqual([])
  })
})
