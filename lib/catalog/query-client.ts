import { HttpRequestError } from "../http/request.ts"
import {
  type PublicCatalogQuery,
  PublicCatalogQueryResponseSchema,
  PublicPlaceDetailResponseSchema,
} from "./query-contract.ts"

export const loadPublicCatalogQuery = async (
  query: Partial<PublicCatalogQuery>,
  signal: AbortSignal,
) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== "") params.set(key, String(value))
  const response = await fetch(`/api/map-catalog/query?${params}`, {
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
  })
  if (!response.ok) throw new HttpRequestError("status")
  const body: unknown = await response.json()
  return PublicCatalogQueryResponseSchema.parse(body)
}

export const loadPublicPlaceDetail = async (slug: string, signal: AbortSignal) => {
  const response = await fetch(`/api/map-catalog/places/${encodeURIComponent(slug)}`, {
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
  })
  if (!response.ok) throw new HttpRequestError("status")
  const body: unknown = await response.json()
  return PublicPlaceDetailResponseSchema.parse(body)
}
