import { afterEach, describe, expect, it, vi } from "vitest"

import { CONTENT_SECURITY_POLICY } from "../../lib/security/headers"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("security headers", () => {
  it("Given development mode, when the CSP is generated, then Next dev eval is explicitly permitted", () => {
    vi.stubEnv("NODE_ENV", "development")

    expect(CONTENT_SECURITY_POLICY()).toContain("'unsafe-eval'")
  })

  it("Given production mode, when the CSP is generated, then eval remains prohibited", () => {
    vi.stubEnv("NODE_ENV", "production")

    expect(CONTENT_SECURITY_POLICY()).not.toContain("'unsafe-eval'")
  })

  it("Given a development loopback flag without the typed Playwright mode, when the CSP is generated, then the local analytics origin remains blocked", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_TEST_ALLOW_HTTP_LOOPBACK", "1")
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "http://127.0.0.1:3498")

    expect(CONTENT_SECURITY_POLICY()).not.toContain("http://127.0.0.1:3498")
  })

  it("Given both typed Playwright loopback flags, when the development CSP is generated, then the local analytics origin is connected", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_PLAYWRIGHT_TEST", "1")
    vi.stubEnv("NEXT_PUBLIC_TEST_ALLOW_HTTP_LOOPBACK", "1")
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "http://127.0.0.1:3498")

    expect(CONTENT_SECURITY_POLICY()).toContain("http://127.0.0.1:3498")
  })
})
