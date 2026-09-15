import { DiscoveryReadError } from "./contracts"

type DiscoveryOperation = "state_rpc" | "query_rpc" | "detail_rpc" | "places" | "regions" | "detail"

export const reportDiscoveryFailure = (
  operation: DiscoveryOperation,
  error: unknown,
  startedAt: number,
  status?: number,
): void => {
  if (
    error instanceof DiscoveryReadError &&
    ["cancelled", "invalid_request", "stale_cursor"].includes(error.kind)
  )
    return
  // Do not log URLs, query text, coordinates, identifiers, keys, or upstream bodies.
  console.error("[discovery] read_failed", {
    operation,
    kind: error instanceof DiscoveryReadError ? error.kind : "unexpected",
    durationMs: Math.round(performance.now() - startedAt),
    ...(status === undefined ? {} : { upstreamStatus: status }),
  })
}
