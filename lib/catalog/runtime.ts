import { createHash } from "node:crypto"
import { z } from "zod"
import catalogSource from "../../data/catalog.json"
import { type DataMode, MenuSchema, PlaceSchema } from "../domain/catalog.ts"
import { requestJson } from "../http/request.ts"
import { createNextPublicCatalogReader, type PublicCatalogReader } from "./next-cache.ts"
import {
  createPublicCatalogRepository,
  type PublicCatalog,
  type SupabaseCatalogClient,
} from "./repository.ts"

const PublicSupabaseUrlSchema = z.url({ protocol: /^https?$/ })
const RawRowsSchema = z.array(z.unknown()).readonly()

export class PublicCatalogConfigurationError extends Error {
  readonly name = "PublicCatalogConfigurationError"

  constructor() {
    super("The public Supabase catalog configuration is incomplete or invalid")
  }
}

export type PublicCatalogRuntimeProvider = {
  readonly mode: DataMode
  readonly read: PublicCatalogReader
}

type PublicCatalogEnvironment = Readonly<{
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string | undefined
  NEXT_PUBLIC_SUPABASE_URL?: string | undefined
}>

const mockCatalog = (): PublicCatalog => {
  const places = catalogSource.places.map((entry) =>
    PlaceSchema.parse({
      address: entry.address,
      dataMode: catalogSource.data_mode,
      healthTags: entry.health_tags,
      id: entry.id,
      latitude: entry.latitude,
      longitude: entry.longitude,
      name: entry.name,
      naverPlaceUrl: entry.naver_place_url,
      primaryTag: entry.primary_tag,
      published: entry.published,
      slug: entry.slug,
    }),
  )
  const menus = catalogSource.places.flatMap((place) =>
    place.menus.map((menu) =>
      MenuSchema.parse({
        dataMode: catalogSource.data_mode,
        displayOrder: menu.display_order,
        evidenceUrl: menu.evidence_url,
        healthTags: menu.health_tags,
        id: menu.id,
        name: menu.name,
        placeId: place.id,
        published: menu.published,
        verifiedAt: menu.verified_at,
      }),
    ),
  )
  return { places, menus }
}

const configuredValues = (
  environment: PublicCatalogEnvironment,
):
  | {
      readonly key: string
      readonly url: string
    }
  | undefined => {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (url === undefined && key === undefined) return undefined
  if (url === undefined || key === undefined || !PublicSupabaseUrlSchema.safeParse(url).success)
    throw new PublicCatalogConfigurationError()
  return { key, url }
}

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
  const headers = { apikey: key, authorization: `Bearer ${key}` }
  const select = (table: "places" | "menus"): Promise<readonly unknown[]> =>
    requestJson(
      new URL(`/rest/v1/${table}?select=*&published=eq.true&order=id.asc`, url).toString(),
      RawRowsSchema,
      { headers },
    )
  return {
    selectPublishedPlaces: () => select("places"),
    selectPublishedMenus: () => select("menus"),
  }
}

export const createPublicCatalogRuntimeProvider = (
  environment: PublicCatalogEnvironment,
): PublicCatalogRuntimeProvider => {
  const config = configuredValues(environment)
  if (config === undefined) {
    const catalog = mockCatalog()
    return { mode: "mock", read: async () => catalog }
  }
  const repository = createPublicCatalogRepository(
    createSupabasePublicCatalogClient(config.url, config.key),
  )
  return {
    mode: "production",
    read: createNextPublicCatalogReader(repository, getPublicCatalogCacheIdentity(config.url)),
  }
}

export const getPublicCatalogRuntimeProvider = (): PublicCatalogRuntimeProvider =>
  createPublicCatalogRuntimeProvider({
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"],
  })

export const getMockCatalog = (): PublicCatalog => mockCatalog()

export const isCatalogMode = (catalog: PublicCatalog, mode: DataMode): boolean =>
  catalog.places.every((place) => place.dataMode === mode) &&
  catalog.menus.every((menu) => menu.dataMode === mode)
