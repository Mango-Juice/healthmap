import type { z } from "zod"

export const DEFAULT_HTTP_TIMEOUT_MILLISECONDS = 5_000

export class HttpRequestError extends Error {
  readonly name = "HttpRequestError"

  constructor(readonly kind: "network" | "timeout" | "status" | "invalid_response") {
    super(`HTTP request failed: ${kind}`)
  }
}

type RequestOptions = {
  readonly body?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly method?: "GET" | "POST"
  readonly timeoutMilliseconds?: number
}

export const requestJson = async <Schema extends z.ZodType>(
  url: string,
  schema: Schema,
  options: RequestOptions = {},
): Promise<z.output<Schema>> => {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    options.timeoutMilliseconds ?? DEFAULT_HTTP_TIMEOUT_MILLISECONDS,
  )
  try {
    const requestOptions: RequestInit = { cache: "no-store", signal: controller.signal }
    if (options.body !== undefined) requestOptions.body = options.body
    if (options.headers !== undefined) requestOptions.headers = options.headers
    if (options.method !== undefined) requestOptions.method = options.method
    const response = await fetch(url, requestOptions)
    if (!response.ok) throw new HttpRequestError("status")
    const body: unknown = await response.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new HttpRequestError("invalid_response")
    return parsed.data
  } catch (error) {
    if (error instanceof HttpRequestError) throw error
    if (error instanceof DOMException && error.name === "AbortError")
      throw new HttpRequestError("timeout")
    throw new HttpRequestError("network")
  } finally {
    globalThis.clearTimeout(timeout)
  }
}
