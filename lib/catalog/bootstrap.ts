import type { PublicCatalogSnapshot } from "../domain/catalog.ts"
import { queryPublicCatalog } from "./query.ts"
import { type PublicCatalogQuery, PublicCatalogQuerySchema } from "./query-contract.ts"

export const createPublicCatalogBootstrap = (
  catalog: PublicCatalogSnapshot,
  query: Partial<PublicCatalogQuery> = { mode: "regions" },
) => {
  const parsedQuery = PublicCatalogQuerySchema.parse(query)
  const result = queryPublicCatalog(catalog, parsedQuery)
  if ("error" in result) throw new PublicCatalogBootstrapError()
  return { ...result, query: parsedQuery }
}
class PublicCatalogBootstrapError extends Error {
  readonly name = "PublicCatalogBootstrapError"
}
