import { z } from "zod"
import {
  ProductionMenuSchema as LegacyMenuSchema,
  ProductionPlaceSchema as LegacyPlaceSchema,
  parseMenuRows as parseLegacyMenuRows,
  parsePlaceRows as parseLegacyPlaceRows,
} from "./catalog-v1.ts"
import {
  ProductionMenuV2Schema,
  ProductionPlaceV2Schema,
  parseV2MenuRow,
  parseV2PlaceRow,
} from "./catalog-v2.ts"

export { VerificationMethodSchema } from "./catalog-v1.ts"
export { ProductionMenuV2Schema, ProductionPlaceV2Schema } from "./catalog-v2.ts"
export const PlaceSchema = z.union([LegacyPlaceSchema, ProductionPlaceV2Schema])
export const MenuSchema = z.union([LegacyMenuSchema, ProductionMenuV2Schema])
export const ProductionPlaceSchema = PlaceSchema
export const ProductionMenuSchema = MenuSchema
export type Place = z.infer<typeof PlaceSchema>
export type Menu = z.infer<typeof MenuSchema>
const SnapshotFields = {
  catalogVersion: z.string().trim().min(1).max(120),
  dataMode: z.literal("production"),
} as const
export const PublicCatalogSnapshotSchema = z.union([
  z
    .strictObject({
      ...SnapshotFields,
      schemaVersion: z.literal("1.0.0").optional(),
      places: z.array(LegacyPlaceSchema).readonly(),
      menus: z.array(LegacyMenuSchema).readonly(),
    })
    .readonly(),
  z
    .strictObject({
      ...SnapshotFields,
      schemaVersion: z.literal("2.0.0"),
      places: z.array(ProductionPlaceV2Schema).readonly(),
      menus: z.array(ProductionMenuV2Schema).readonly(),
    })
    .readonly(),
])
export type PublicCatalogSnapshot = z.infer<typeof PublicCatalogSnapshotSchema>
const V2RowVersionSchema = z.object({ schema_version: z.literal("2.0.0") })
export const parsePlaceRows = (rows: readonly unknown[]): readonly Place[] =>
  rows.flatMap<Place>((row) =>
    V2RowVersionSchema.safeParse(row).success
      ? [parseV2PlaceRow(row)]
      : parseLegacyPlaceRows([row]),
  )
export const parseMenuRows = (rows: readonly unknown[]): readonly Menu[] =>
  rows.flatMap<Menu>((row) =>
    V2RowVersionSchema.safeParse(row).success ? [parseV2MenuRow(row)] : parseLegacyMenuRows([row]),
  )
