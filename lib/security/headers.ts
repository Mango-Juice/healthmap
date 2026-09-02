import type { NextConfig } from "next"

type Header = Readonly<{ readonly key: string; readonly value: string }>
type HeaderRule = Readonly<{ readonly headers: readonly Header[]; readonly source: string }>

const isLoopbackHostname = (hostname: string): boolean =>
  hostname === "localhost" || hostname === "::1" || /^127(?:[.]\d{1,3}){3}$/.test(hostname)

const configuredConnectionOrigin = (value: string | undefined): string | null => {
  try {
    const url = new URL(value ?? "")
    if (url.username || url.password) return null
    const isHttps = url.protocol === "https:"
    const isExplicitDevelopmentLoopback =
      process.env["NODE_ENV"] === "development" &&
      process.env["NEXT_PUBLIC_TEST_ALLOW_HTTP_LOOPBACK"] === "1" &&
      process.env["NEXT_PUBLIC_PLAYWRIGHT_TEST"] === "1" &&
      url.protocol === "http:" &&
      isLoopbackHostname(url.hostname)
    return isHttps || isExplicitDevelopmentLoopback ? url.origin : null
  } catch {
    return null
  }
}

const connectionOrigins = (): readonly string[] =>
  [
    "https://oapi.map.naver.com",
    "https://nrbe.map.naver.net",
    "https://kr-col-ext.nelo.navercorp.com",
    ...(process.env["NODE_ENV"] === "development"
      ? ["http://oapi.map.naver.com", "http://nrbe.map.naver.net"]
      : []),
    configuredConnectionOrigin(process.env["NEXT_PUBLIC_SUPABASE_URL"]),
    configuredConnectionOrigin(process.env["NEXT_PUBLIC_POSTHOG_HOST"]),
  ].flatMap((origin) => (origin === null ? [] : [origin]))

const naverScriptOrigins = (): string =>
  [
    "https://oapi.map.naver.com",
    "https://nrbe.map.naver.net",
    "https://nrbe.pstatic.net",
    ...(process.env["NODE_ENV"] === "development"
      ? ["http://oapi.map.naver.com", "http://nrbe.map.naver.net"]
      : []),
  ].join(" ")

const naverImageOrigins = (): string =>
  [
    "https://static.naver.net",
    "https://nrbe.map.naver.net",
    "https://map.pstatic.net",
    "https://ssl.pstatic.net",
    ...(process.env["NODE_ENV"] === "development"
      ? ["http://static.naver.net", "http://nrbe.map.naver.net"]
      : []),
  ].join(" ")

// Next injects inline styles at runtime; eval is restricted to Next development mode.
export const CONTENT_SECURITY_POLICY = (): string =>
  [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `script-src 'self' 'unsafe-inline'${process.env["NODE_ENV"] === "development" ? " 'unsafe-eval'" : ""} ${naverScriptOrigins()}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${naverImageOrigins()}`,
    `connect-src 'self' ${connectionOrigins().join(" ")}`,
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ")

export const SECURITY_HEADERS = (): readonly Header[] => [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY() },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
]

export const nextSecurityHeaders = (): readonly HeaderRule[] => [
  { headers: SECURITY_HEADERS(), source: "/:path*" },
]

export const securityHeadersConfig = (): Pick<NextConfig, "headers"> => ({
  headers: () =>
    nextSecurityHeaders().map(({ headers, source }) => ({
      headers: headers.map((header) => ({ ...header })),
      source,
    })),
})
