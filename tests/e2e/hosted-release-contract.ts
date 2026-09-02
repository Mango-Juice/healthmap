import { PublicCatalogSnapshotSchema } from "../../lib/domain/catalog.ts"

const MAX_CATALOG_VERSION_LENGTH = 120

type HostedCatalogOptions = Readonly<{
  currentDate?: string
  expectedCatalogVersion: string
}>

export function readExpectedHostedCatalogVersion(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const value = environment["E2E_EXPECTED_CATALOG_VERSION"]
  const hasControlCharacter =
    typeof value === "string" &&
    [...value].some((character) => {
      const code = character.codePointAt(0)
      return code !== undefined && (code <= 31 || code === 127)
    })
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_CATALOG_VERSION_LENGTH ||
    value.trim() !== value ||
    hasControlCharacter
  )
    throw new Error("E2E_EXPECTED_CATALOG_VERSION is required for hosted release verification")
  return value
}

export function assertHostedReleaseCatalog(input: unknown, options: HostedCatalogOptions): void {
  const catalog = PublicCatalogSnapshotSchema.parse(input)
  const currentDate = options.currentDate ?? new Date().toISOString().slice(0, 10)

  if (catalog.catalogVersion !== options.expectedCatalogVersion)
    throw new Error("hosted catalog version mismatch")
  if (catalog.places.length < 100) throw new Error("hosted catalog requires at least 100 places")

  const placeIds = new Set(catalog.places.map((place) => place.id))
  if (placeIds.size !== catalog.places.length)
    throw new Error("hosted catalog requires unique place IDs")

  const currentMenuPlaceIds = new Set(
    catalog.menus
      .filter(
        (menu) =>
          menu.published && menu.verifiedAt <= currentDate && menu.validUntil >= currentDate,
      )
      .map((menu) => menu.placeId),
  )
  if (!catalog.places.every((place) => place.published && currentMenuPlaceIds.has(place.id)))
    throw new Error("hosted catalog requires one current valid published menu per place")
}
