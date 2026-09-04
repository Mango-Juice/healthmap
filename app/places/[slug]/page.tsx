import { permanentRedirect } from "next/navigation"

// biome-ignore lint/style/noDefaultExport: Next.js page convention requires a default export.
export default function PlacePage() {
  permanentRedirect("/")
}
