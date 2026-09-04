import "server-only"
import { currentPilotCatalog, PilotCatalogSchema } from "./catalog"
import pilotCatalogJson from "./pilot-catalog.json"

const snapshot = PilotCatalogSchema.safeParse(pilotCatalogJson)
export const readPilotCatalog = () =>
  snapshot.success ? currentPilotCatalog(snapshot.data, Date.now()) : null
