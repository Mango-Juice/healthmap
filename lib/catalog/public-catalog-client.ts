import { type PublicCatalogSnapshot, PublicCatalogSnapshotSchema } from "../domain/catalog.ts"
import { requestJson } from "../http/request.ts"

export type ClientPublicCatalog = PublicCatalogSnapshot

export const loadPublicCatalog = (): Promise<ClientPublicCatalog> =>
  requestJson("/api/map-catalog", PublicCatalogSnapshotSchema)
