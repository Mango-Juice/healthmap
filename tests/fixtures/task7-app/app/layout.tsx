import type { ReactNode } from "react"

import { AnalyticsProvider } from "../../../../components/analytics/analytics-provider"

type LayoutProperties = {
  readonly children: ReactNode
}

function Task7FixtureLayout({ children }: LayoutProperties) {
  return (
    <html lang="ko">
      <body>
        <AnalyticsProvider />
        {children}
      </body>
    </html>
  )
}

// biome-ignore lint/style/noDefaultExport: Next App Router requires the layout default export.
export default Task7FixtureLayout
