import { describe, expect, it } from "vitest"

import {
  getMissingPublicEnvironmentNames,
  PUBLIC_ENVIRONMENT_NAMES,
  parsePlaywrightPublicEnvironment,
  parsePublicEnvironment,
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

  it("Given a loopback analytics endpoint, when no local policy is provided, then analytics is suppressed", () => {
    const environment = {
      NEXT_PUBLIC_POSTHOG_HOST: "http://127.0.0.1:3498",
      NEXT_PUBLIC_POSTHOG_KEY: "test-key",
    }

    const parsed = parsePublicEnvironment(environment)

    expect(parsed.analytics).toBeNull()
    expect(parsed.invalid).toEqual(["NEXT_PUBLIC_POSTHOG_HOST"])
  })

  it("Given both typed Playwright loopback flags, when a loopback analytics endpoint is provided, then analytics is configured", () => {
    const environment = {
      NEXT_PUBLIC_PLAYWRIGHT_TEST: "1",
      NEXT_PUBLIC_POSTHOG_HOST: "http://127.0.0.1:3498",
      NEXT_PUBLIC_POSTHOG_KEY: "test-key",
      NEXT_PUBLIC_TEST_ALLOW_HTTP_LOOPBACK: "1",
    }

    const parsed = parsePlaywrightPublicEnvironment(environment)

    expect(parsed.analytics).toEqual({ key: "test-key", url: "http://127.0.0.1:3498" })
  })
})
