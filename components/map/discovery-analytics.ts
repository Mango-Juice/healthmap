import { captureProductAnalytics } from "../../lib/analytics/browser"
import { normalizeDiscoveryQuery } from "../../lib/domain/discovery"

export const recordDiscoverySearch = (query: string, count: number): void => {
  if (normalizeDiscoveryQuery(query).length === 0) return
  const resultCountBucket =
    count === 0 ? "0" : count <= 5 ? "1_5" : count <= 20 ? "6_20" : "21_plus"
  captureProductAnalytics({
    event: "search_used",
    properties: { result_count_bucket: resultCountBucket },
  })
}
