import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { SuggestionSchema } from "../../lib/suggestions/contracts"
import { saveLocalSuggestion } from "../../lib/suggestions/local-store"

const input = {
  requestId: "11111111-1111-4111-8111-111111111111",
  kind: "menu_correction",
  placeUrl: "https://example.com/place#menu",
  text: "LOCAL TEST ONLY 메뉴 변경 확인 요청입니다.",
  evidenceUrl: "https://example.com/menu",
}

describe("moderated suggestions", () => {
  it("normalizes HTTPS and rejects credentials, oversized text and extra fields", () => {
    expect(SuggestionSchema.parse(input).placeUrl).toBe("https://example.com/place")
    for (const placeUrl of [
      "javascript:alert(1)",
      "http://example.com",
      "https://user:pass@example.com",
    ]) {
      expect(SuggestionSchema.safeParse({ ...input, placeUrl }).success).toBe(false)
    }
    expect(SuggestionSchema.safeParse({ ...input, text: "x".repeat(2001) }).success).toBe(false)
    expect(SuggestionSchema.safeParse({ ...input, status: "published" }).success).toBe(false)
  })
  it("persists pending, deduplicates, rejects changed replay and limits requestor", async () => {
    const directory = await mkdtemp(join(tmpdir(), "healthmap-suggestion-"))
    try {
      const submission = SuggestionSchema.parse(input)
      expect(await saveLocalSuggestion(directory, submission, "actor")).toBe("queued")
      expect(await saveLocalSuggestion(directory, submission, "actor")).toBe("duplicate")
      expect(
        await saveLocalSuggestion(
          directory,
          { ...submission, text: "Changed local fixture text" },
          "actor",
        ),
      ).toBe("conflict")
      for (let index = 2; index <= 6; index++) {
        expect(
          await saveLocalSuggestion(
            directory,
            {
              ...submission,
              requestId: `11111111-1111-4111-8111-11111111111${index}`,
              text: `LOCAL TEST ONLY menu fixture ${index}`,
            },
            "actor",
          ),
        ).toBe(index === 6 ? "limited" : "queued")
      }
      const persisted = await readFile(join(directory, "pending.json"), "utf8")
      expect(JSON.parse(persisted)).toHaveLength(5)
      expect(persisted).toContain('"status": "pending"')
      expect(persisted).not.toContain('"published"')
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})

it("checks browser origin against Host despite Next internal localhost rewrite", async () => {
  const { hasSameSuggestionOrigin } = await import("../../lib/suggestions/origin")
  expect(
    hasSameSuggestionOrigin(
      new Request("http://localhost:3429/api/suggestions", {
        headers: { host: "127.0.0.1:3429", origin: "http://127.0.0.1:3429" },
      }),
    ),
  ).toBe(true)
  expect(
    hasSameSuggestionOrigin(
      new Request("http://localhost:3429/api/suggestions", {
        headers: { host: "127.0.0.1:3429", origin: "https://evil.example" },
      }),
    ),
  ).toBe(false)
})

it("rejects oversized bodies and invalid JSON before storage", async () => {
  const { POST } = await import("../../app/api/suggestions/route")
  const request = (body: string) =>
    new Request("http://localhost/api/suggestions", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body,
    })
  expect((await POST(request("x".repeat(16_385)))).status).toBe(413)
  expect((await POST(request("{"))).status).toBe(400)
  expect((await POST(request(JSON.stringify({ ...input, text: "short" })))).status).toBe(400)
})

it("uses service persistence on configured Preview and Production without a scope", async () => {
  const http = await import("../../lib/http/request")
  const { submitSuggestion } = await import("../../lib/suggestions/server")
  const rpc = vi.spyOn(http, "requestJson").mockResolvedValue("queued")
  vi.stubEnv("VERCEL", "1")
  vi.stubEnv("VERCEL_ENV", "preview")
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("HEALTHMAP_SUGGESTION_HASH_SECRET", "LOCAL_TEST_ONLY_SECRET_32_CHARACTERS")
  vi.stubEnv("HEALTHMAP_SUGGESTION_SERVICE_KEY", "LOCAL_TEST_ONLY_NO_NETWORK")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.com")
  try {
    const request = new Request("https://example.com/api/suggestions")
    expect(await submitSuggestion(request, SuggestionSchema.parse(input))).toBe("queued")
    expect(rpc).toHaveBeenCalledOnce()
    vi.stubEnv("VERCEL_ENV", "production")
    expect(await submitSuggestion(request, SuggestionSchema.parse(input))).toBe("queued")
    expect(rpc).toHaveBeenCalledTimes(2)
  } finally {
    rpc.mockRestore()
    vi.unstubAllEnvs()
  }
})

it("uses the secret API key without a JWT header for public submissions", async () => {
  const { submitSuggestion } = await import("../../lib/suggestions/server")
  const gateway = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_url, options) =>
      new Headers(options?.headers).has("authorization")
        ? new Response("Invalid JWT", { status: 401 })
        : Response.json("queued"),
    )
  vi.stubEnv("VERCEL", "1")
  vi.stubEnv("VERCEL_ENV", "production")
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("HEALTHMAP_SUGGESTION_HASH_SECRET", "LOCAL_TEST_ONLY_SECRET_32_CHARACTERS")
  vi.stubEnv("HEALTHMAP_SUGGESTION_SERVICE_KEY", "sb_secret_LOCAL_TEST_ONLY")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.com")
  try {
    const request = new Request("https://example.com/api/suggestions")
    expect(await submitSuggestion(request, SuggestionSchema.parse(input))).toBe("queued")
    expect(gateway).toHaveBeenCalledOnce()
    const headers = new Headers(gateway.mock.calls[0]?.[1]?.headers)
    expect(headers.get("apikey")).toBe("sb_secret_LOCAL_TEST_ONLY")
  } finally {
    gateway.mockRestore()
    vi.unstubAllEnvs()
  }
})

it("keeps local suggestion storage limited to loopback development", async () => {
  const { isLocalSuggestionDevelopment } = await import("../../lib/suggestions/server")
  vi.stubEnv("NODE_ENV", "development")
  vi.stubEnv("VERCEL", "")
  try {
    expect(isLocalSuggestionDevelopment(new URL("http://127.0.0.1/api/suggestions"))).toBe(true)
    expect(isLocalSuggestionDevelopment(new URL("https://example.com/api/suggestions"))).toBe(false)
    vi.stubEnv("VERCEL", "1")
    expect(isLocalSuggestionDevelopment(new URL("http://127.0.0.1/api/suggestions"))).toBe(false)
    vi.stubEnv("VERCEL", "")
    vi.stubEnv("NODE_ENV", "production")
    expect(isLocalSuggestionDevelopment(new URL("http://127.0.0.1/api/suggestions"))).toBe(false)
  } finally {
    vi.unstubAllEnvs()
  }
})

it("stores local development suggestions outside the retired automation directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "healthmap-local-suggestion-"))
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(directory)
  vi.stubEnv("NODE_ENV", "development")
  vi.stubEnv("VERCEL", "")
  try {
    const { submitSuggestion } = await import("../../lib/suggestions/server")
    const request = new Request("http://127.0.0.1/api/suggestions")

    expect(await submitSuggestion(request, SuggestionSchema.parse(input))).toBe("queued")
    await expect(
      readFile(join(directory, ".local", "suggestions", "pending.json"), "utf8"),
    ).resolves.toContain('"status": "pending"')
  } finally {
    cwd.mockRestore()
    vi.unstubAllEnvs()
    await rm(directory, { force: true, recursive: true })
  }
})
