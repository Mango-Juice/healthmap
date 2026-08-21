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

  it("Given development mode, when NAVER Maps loads on localhost, then its HTTP runtime assets are permitted", () => {
    vi.stubEnv("NODE_ENV", "development")

    const policy = CONTENT_SECURITY_POLICY()

    expect(policy).toContain("http://oapi.map.naver.com")
    expect(policy).toContain("http://nrbe.map.naver.net")
    expect(policy).toContain("http://static.naver.net")
  })

  it("Given production mode, when the CSP is generated, then only HTTPS NAVER runtime assets are permitted", () => {
    vi.stubEnv("NODE_ENV", "production")

    const policy = CONTENT_SECURITY_POLICY()

    expect(policy).toContain("https://nrbe.map.naver.net")
    expect(policy).toContain("https://static.naver.net")
    expect(policy).not.toContain("http://oapi.map.naver.com")
    expect(policy).not.toContain("http://nrbe.map.naver.net")
    expect(policy).not.toContain("http://static.naver.net")
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
