import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetchWithTransientRetry } from "../../lib/http/fetch-with-transient-retry"

describe("bounded transient GET recovery", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("returns a successful response without retrying", async () => {
    const response = Response.json({ results: [] })
    fetchMock.mockResolvedValue(response)

    await expect(
      fetchWithTransientRetry("/api/places", new AbortController().signal),
    ).resolves.toBe(response)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([502, 503, 504])(
    "recovers HTTP %i once using the same URL and signal",
    async (status) => {
      const controller = new AbortController()
      const response = Response.json({ results: [] })
      fetchMock
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockResolvedValueOnce(response)

      const pending = fetchWithTransientRetry("/api/places?cursor=next", controller.signal)
      await vi.advanceTimersByTimeAsync(499)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)

      await expect(pending).resolves.toBe(response)
      expect(fetchMock.mock.calls).toEqual([
        ["/api/places?cursor=next", { signal: controller.signal }],
        ["/api/places?cursor=next", { signal: controller.signal }],
      ])
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it("recovers a fetch network failure once", async () => {
    const response = Response.json({ results: [] })
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(response)

    const pending = fetchWithTransientRetry("/api/places", new AbortController().signal)
    await vi.advanceTimersByTimeAsync(500)

    await expect(pending).resolves.toBe(response)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("waits for the server's Retry-After delta-seconds before retrying", async () => {
    const response = Response.json({ results: [] })
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503, headers: { "Retry-After": "1" } }))
      .mockResolvedValueOnce(response)

    const pending = fetchWithTransientRetry("/api/places", new AbortController().signal)
    await vi.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    await expect(pending).resolves.toBe(response)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("uses the normal delay for a malformed Retry-After header", async () => {
    const response = Response.json({ results: [] })
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, { status: 503, headers: { "Retry-After": "invalid" } }),
      )
      .mockResolvedValueOnce(response)

    const pending = fetchWithTransientRetry("/api/places", new AbortController().signal)
    await vi.advanceTimersByTimeAsync(499)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    await expect(pending).resolves.toBe(response)
  })

  it("returns the second HTTP failure without a third attempt", async () => {
    const response = new Response(null, { status: 503 })
    fetchMock.mockResolvedValue(response)

    const pending = fetchWithTransientRetry("/api/places", new AbortController().signal)
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toBe(response)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("rejects a repeated network failure without a third attempt", async () => {
    const error = new TypeError("Failed to fetch")
    fetchMock.mockRejectedValue(error)

    const rejected = expect(
      fetchWithTransientRetry("/api/places", new AbortController().signal),
    ).rejects.toBe(error)
    await vi.runAllTimersAsync()

    await rejected
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([400, 404, 409, 422, 429, 500])("does not retry HTTP %i", async (status) => {
    const response = new Response(null, { status })
    fetchMock.mockResolvedValue(response)

    await expect(
      fetchWithTransientRetry("/api/places", new AbortController().signal),
    ).resolves.toBe(response)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not retry non-network exceptions", async () => {
    const error = new DOMException("Request aborted", "AbortError")
    fetchMock.mockRejectedValue(error)

    await expect(fetchWithTransientRetry("/api/places", new AbortController().signal)).rejects.toBe(
      error,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not start an already cancelled request", async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(fetchWithTransientRetry("/api/places", controller.signal)).rejects.toBe(
      controller.signal.reason,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("cancels the retry delay when the query changes or unmounts", async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }))

    const rejected = expect(
      fetchWithTransientRetry("/api/places", controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
    })
    await vi.advanceTimersByTimeAsync(250)
    controller.abort()
    await vi.runAllTimersAsync()

    await rejected
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("keeps the caller's 10-second deadline across a slow first attempt and pending retry", async () => {
    const controller = new AbortController()
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(new Response(null, { status: 503 })), 9_000),
          ),
      )
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) =>
            controller.signal.addEventListener("abort", () => reject(controller.signal.reason), {
              once: true,
            }),
          ),
      )
    const deadline = setTimeout(() => controller.abort(), 10_000)
    const rejected = expect(
      fetchWithTransientRetry("/api/places", controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
    })

    await vi.advanceTimersByTimeAsync(9_500)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(controller.signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(500)

    await rejected
    expect(controller.signal.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    clearTimeout(deadline)
  })
})
