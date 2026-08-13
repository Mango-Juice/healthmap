import { MapDiscovery } from "../../../../components/map/map-discovery"
import { task7ActionCatalog } from "../../task7-action-catalog"

function Task7FixturePage() {
  return (
    <main>
      <MapDiscovery
        clientId={undefined}
        directionsTargets={task7ActionCatalog.directionsTargets}
        initialMenus={task7ActionCatalog.menus}
        initialPlaces={task7ActionCatalog.places}
      />
    </main>
  )
}

// biome-ignore lint/style/noDefaultExport: Next App Router requires the page default export.
export default Task7FixturePage
