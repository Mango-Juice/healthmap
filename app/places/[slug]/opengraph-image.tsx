import { notFound } from "next/navigation"
import { ImageResponse } from "next/og"

import { getPublishedPlaceMenus } from "../../route-seo.ts"
import { getPublishedPlaceRouteData } from "./place-data.ts"

export const alt = "강남·역삼 건강식 지도 장소 정보"
export const contentType = "image/png"
export const size = { width: 1200, height: 630 }

type OpenGraphImageProperties = {
  readonly params: Promise<{ readonly slug: string }>
}

const TAG_LABELS = {
  balanced: "균형식",
  plant_based: "식물성",
  protein: "단백질",
  vegetables: "채소",
} as const

const OG_FIXED_CANVAS_TOKENS = {
  border: "#d7d2c6",
  canvas: "#f4f0e7",
  green800: "#18563b",
  green950: "#0d3425",
  ink: "#17231c",
  inkMuted: "#536159",
  borderWidth: 2,
  ctaPaddingTop: 28,
  emphasisWeight: 700,
  kickerSize: 30,
  menuSize: 38,
  menuWeight: 500,
  outerPaddingBlock: 72,
  outerPaddingInline: 80,
  sectionGap: 24,
  titleSize: 72,
} as const

const KOREAN_FONT_STACK =
  '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif'

// biome-ignore lint/style/noDefaultExport: Next.js metadata convention requires a default export.
export default async function OpenGraphImage({ params }: OpenGraphImageProperties) {
  const routeData = await getPublishedPlaceRouteData((await params).slug)
  if (routeData === null) notFound()
  const today = new Date().toISOString().slice(0, 10)
  const representativeMenu = getPublishedPlaceMenus(
    routeData.catalog.menus,
    routeData.place,
    today,
  )[0]

  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: OG_FIXED_CANVAS_TOKENS.canvas,
        color: OG_FIXED_CANVAS_TOKENS.ink,
        display: "flex",
        flexDirection: "column",
        fontFamily: KOREAN_FONT_STACK,
        height: "100%",
        justifyContent: "space-between",
        padding: `${OG_FIXED_CANVAS_TOKENS.outerPaddingBlock}px ${OG_FIXED_CANVAS_TOKENS.outerPaddingInline}px`,
        width: "100%",
      }}
    >
      <div
        style={{
          color: OG_FIXED_CANVAS_TOKENS.green800,
          display: "flex",
          fontSize: OG_FIXED_CANVAS_TOKENS.kickerSize,
          fontWeight: OG_FIXED_CANVAS_TOKENS.emphasisWeight,
        }}
      >
        건강식 지도 · {TAG_LABELS[routeData.place.primaryTag]}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: OG_FIXED_CANVAS_TOKENS.sectionGap,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: OG_FIXED_CANVAS_TOKENS.titleSize,
            fontWeight: OG_FIXED_CANVAS_TOKENS.emphasisWeight,
          }}
        >
          {routeData.place.name}
        </div>
        <div
          style={{
            color: OG_FIXED_CANVAS_TOKENS.inkMuted,
            display: "flex",
            fontSize: OG_FIXED_CANVAS_TOKENS.menuSize,
            fontWeight: OG_FIXED_CANVAS_TOKENS.menuWeight,
          }}
        >
          {representativeMenu?.name ?? "검증된 건강식 메뉴"}
        </div>
      </div>
      <div
        style={{
          borderTop: `${OG_FIXED_CANVAS_TOKENS.borderWidth}px solid ${OG_FIXED_CANVAS_TOKENS.border}`,
          color: OG_FIXED_CANVAS_TOKENS.green950,
          display: "flex",
          fontSize: OG_FIXED_CANVAS_TOKENS.kickerSize,
          fontWeight: OG_FIXED_CANVAS_TOKENS.emphasisWeight,
          paddingTop: OG_FIXED_CANVAS_TOKENS.ctaPaddingTop,
        }}
      >
        강남·역삼 건강식 지도에서 보기
      </div>
    </div>,
    size,
  )
}
