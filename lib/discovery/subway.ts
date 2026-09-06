import { createHash } from "node:crypto"
import { z } from "zod"
import { PlaceIdSchema, PlaceSlugSchema } from "../domain/contracts"
import { ExactSubwayStoreUrlSchema } from "./subway-url"

export const SubwayStoreSchema = z
  .strictObject({
    id: PlaceIdSchema,
    slug: PlaceSlugSchema,
    officialStoreId: z.string().trim().min(1),
    brandId: z.literal("subway"),
    brandName: z.literal("서브웨이"),
    name: z.string().trim().min(1),
    address: z.string().trim().min(1),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    officialDetailUrl: ExactSubwayStoreUrlSchema,
    officialListingUrl: ExactSubwayStoreUrlSchema,
    observedAt: z.iso.datetime({ offset: true }),
  })
  .readonly()

export const SubwayStoreSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    artifactKind: z.literal("store_only_snapshot"),
    brand: z.strictObject({ id: z.literal("subway"), name: z.literal("서브웨이") }).readonly(),
    source: z
      .strictObject({
        listingUrl: ExactSubwayStoreUrlSchema,
        observedAt: z.iso.datetime({ offset: true }),
        sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
        sourceRecordCount: z.number().int().positive(),
      })
      .readonly(),
    derivation: z
      .strictObject({
        publishedRecordCount: z.number().int().positive(),
        excludedComingSoonCount: z.number().int().nonnegative(),
        excludedAdditionalCheckCount: z.number().int().nonnegative(),
        storeFactsOnly: z.literal(true),
        menuEvidenceStatus: z.literal("absent"),
      })
      .readonly(),
    stores: z.array(SubwayStoreSchema).readonly(),
  })
  .readonly()
  .superRefine((snapshot, context) => {
    if (snapshot.stores.length !== snapshot.derivation.publishedRecordCount)
      context.addIssue({ code: "custom", message: "Published store count does not match stores" })
    if (new Set(snapshot.stores.map(({ id }) => id)).size !== snapshot.stores.length)
      context.addIssue({ code: "custom", message: "Subway store IDs must be unique" })
  })

export type SubwayStore = z.infer<typeof SubwayStoreSchema>
export type SubwayStoreSnapshot = z.infer<typeof SubwayStoreSnapshotSchema>
export type SubwayStoreCatalog = {
  readonly version: string
  readonly stores: readonly SubwayStore[]
}

export const toSubwayStoreCatalog = (snapshot: SubwayStoreSnapshot): SubwayStoreCatalog => ({
  version: `subway-${createHash("sha256")
    .update(snapshot.source.sourceSha256)
    .update(JSON.stringify(snapshot.stores))
    .digest("hex")
    .slice(0, 12)}`,
  stores: snapshot.stores,
})

export const combinedDiscoveryCatalogVersion = (
  discoveryVersion: string,
  subway: SubwayStoreCatalog | undefined,
): string => (subway ? `${discoveryVersion}+${subway.version}` : discoveryVersion)
