import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { requestJson } from "../../../lib/http/request"

afterEach(() => vi.restoreAllMocks())

describe("JSON HTTP request options", () => {
  it("Given no method or body, when requested, then the existing GET defaults are preserved", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })))

    await requestJson("https://catalog.example.test/value", z.object({ ok: z.literal(true) }))

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(fetchSpy.mock.calls[0]?.[1]?.method).toBeUndefined()
    expect(fetchSpy.mock.calls[0]?.[1]?.body).toBeUndefined()
  })

  it("Given an RPC method and body, when requested, then both reach the HTTP boundary", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })))

    await requestJson("https://catalog.example.test/rpc", z.object({ ok: z.literal(true) }), {
      body: "{}",
      method: "POST",
    })

    expect(fetchSpy.mock.calls[0]?.[1]?.method).toBe("POST")
    expect(fetchSpy.mock.calls[0]?.[1]?.body).toBe("{}")
  })
})
