import { createHash } from "node:crypto"
import { parsePublicEnvironment } from "../../app/public-environment.ts"
import { PublicCatalogSnapshotSchema } from "../domain/catalog.ts"
import { requestJson } from "../http/request.ts"
import { createNextPublicCatalogReader, type PublicCatalogReader } from "./next-cache.ts"
import { createPublicCatalogRepository, type SupabaseCatalogClient } from "./repository.ts"

export class PublicCatalogConfigurationError extends Error {
  readonly name = "PublicCatalogConfigurationError"

  constructor() {
    super("The public Supabase catalog configuration is incomplete or invalid")
  }
}

export type PublicCatalogRuntimeProvider = {
  readonly read: PublicCatalogReader
}

type PublicCatalogEnvironment = Readonly<Record<string, string | undefined>>

export const getPublicCatalogCacheIdentity = (url: string): string => {
  const parsed = new URL(url)
  const normalizedOrigin = `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, "")}`
  const discriminator = createHash("sha256").update(normalizedOrigin).digest("hex").slice(0, 16)
  return `public-catalog-${discriminator}`
}

export const createSupabasePublicCatalogClient = (
  url: string,
  key: string,
): SupabaseCatalogClient => {
  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  }
  const getPublicCatalogSnapshot = () =>
    requestJson(
      new URL("/rest/v1/rpc/get_public_catalog", url).toString(),
      PublicCatalogSnapshotSchema,
      { body: "{}", headers, method: "POST" },
    )
  return { getPublicCatalogSnapshot }
}

export const createPublicCatalogRuntimeProvider = (
  environment: PublicCatalogEnvironment,
): PublicCatalogRuntimeProvider => {
  const config = parsePublicEnvironment(environment).catalog
  if (config === null) throw new PublicCatalogConfigurationError()
  const repository = createPublicCatalogRepository(
    createSupabasePublicCatalogClient(config.url, config.key),
  )
  return {
    read: createNextPublicCatalogReader(repository, getPublicCatalogCacheIdentity(config.url)),
  }
}

export const getPublicCatalogRuntimeProvider = (): PublicCatalogRuntimeProvider =>
  createPublicCatalogRuntimeProvider({
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"],
  })
