import "server-only"
import { currentPilotCatalog, PilotCatalogSchema } from "./catalog"
import pilotCatalogJson from "./pilot-catalog.json"
import { SubwayStoreSnapshotSchema, toSubwayStoreCatalog } from "./subway"
import subwayStoresJson from "./subway-stores.json"

const snapshot = PilotCatalogSchema.safeParse(pilotCatalogJson)
const subwaySnapshot = SubwayStoreSnapshotSchema.safeParse(subwayStoresJson)
export const readPilotCatalog = () =>
  snapshot.success ? currentPilotCatalog(snapshot.data, Date.now()) : null
export const readSubwayStoreCatalog = () =>
  subwaySnapshot.success ? toSubwayStoreCatalog(subwaySnapshot.data) : null
