import type { CSSProperties } from "react"
import styles from "./map-discovery.module.css"

type GeometryKind = "area" | "junction" | "label" | "parcel" | "road" | "water"

type Geometry = {
  readonly block: string
  readonly id: string
  readonly inline: string
  readonly kind: GeometryKind
  readonly rotate?: string
  readonly x: string
  readonly y: string
}

type GeometryStyle = CSSProperties & {
  readonly "--geo-block": string
  readonly "--geo-inline": string
  readonly "--geo-rotate": string
  readonly "--geo-x": string
  readonly "--geo-y": string
}

const geometry = (
  kind: GeometryKind,
  id: string,
  x: string,
  y: string,
  inline: string,
  block: string,
  rotate = "0deg",
): Geometry => ({ block, id, inline, kind, rotate, x, y })

const GEOGRAPHY: readonly Geometry[] = [
  geometry("water", "canal", "62%", "8%", "18%", "84%", "-7deg"),
  geometry("area", "north-park", "6%", "7%", "40%", "18%", "-3deg"),
  geometry("area", "south-park", "55%", "73%", "39%", "18%", "4deg"),
  geometry("area", "west-park", "6%", "72%", "28%", "17%", "-5deg"),
  geometry("parcel", "north-west", "7%", "12%", "15%", "10%", "-2deg"),
  geometry("parcel", "north-center", "28%", "12%", "16%", "10%", "2deg"),
  geometry("parcel", "north-east", "78%", "12%", "15%", "10%", "-3deg"),
  geometry("parcel", "west-center", "7%", "31%", "15%", "11%", "3deg"),
  geometry("parcel", "center-center", "29%", "31%", "15%", "11%", "-2deg"),
  geometry("parcel", "east-center", "78%", "31%", "15%", "11%", "2deg"),
  geometry("parcel", "west-south", "7%", "53%", "15%", "11%", "-3deg"),
  geometry("parcel", "center-south", "29%", "53%", "15%", "11%", "2deg"),
  geometry("parcel", "east-south", "78%", "53%", "15%", "11%", "-2deg"),
  geometry("parcel", "west-bottom", "7%", "76%", "15%", "10%", "2deg"),
  geometry("parcel", "center-bottom", "29%", "76%", "15%", "10%", "-3deg"),
  geometry("parcel", "east-bottom", "78%", "76%", "15%", "10%", "2deg"),
  geometry("road", "avenue-east-west", "4%", "48%", "92%", "var(--hm-space-2)"),
  geometry("road", "avenue-north-south", "48%", "7%", "var(--hm-space-2)", "86%"),
  geometry("road", "collector-north", "4%", "26%", "92%", "var(--hm-space-1)"),
  geometry("road", "collector-south", "4%", "70%", "92%", "var(--hm-space-1)"),
  geometry("road", "collector-west", "24%", "7%", "var(--hm-space-1)", "86%"),
  geometry("road", "collector-east", "74%", "7%", "var(--hm-space-1)", "86%"),
  geometry("road", "connector-diagonal", "27%", "46%", "47%", "var(--hm-space-1)", "34deg"),
  geometry("road", "local-north-west", "7%", "20%", "38%", "var(--hm-border-width)", "-9deg"),
  geometry("road", "local-north-east", "54%", "20%", "38%", "var(--hm-border-width)", "8deg"),
  geometry("road", "local-south-west", "7%", "63%", "38%", "var(--hm-border-width)", "7deg"),
  geometry("road", "local-south-east", "54%", "63%", "38%", "var(--hm-border-width)", "-8deg"),
  geometry("junction", "north-west", "24%", "26%", "var(--hm-space-3)", "var(--hm-space-3)"),
  geometry("junction", "north-center", "48%", "26%", "var(--hm-space-3)", "var(--hm-space-3)"),
  geometry("junction", "north-east", "74%", "26%", "var(--hm-space-3)", "var(--hm-space-3)"),
  geometry("junction", "center-west", "24%", "48%", "var(--hm-space-3)", "var(--hm-space-3)"),
  geometry("junction", "center", "48%", "48%", "var(--hm-space-3)", "var(--hm-space-3)"),
  geometry("junction", "center-east", "74%", "48%", "var(--hm-space-3)", "var(--hm-space-3)"),
  geometry("junction", "south-west", "24%", "70%", "var(--hm-space-3)", "var(--hm-space-3)"),
  geometry("junction", "south-center", "48%", "70%", "var(--hm-space-3)", "var(--hm-space-3)"),
  geometry("junction", "south-east", "74%", "70%", "var(--hm-space-3)", "var(--hm-space-3)"),
  geometry("label", "gangnam", "8%", "34%", "auto", "auto"),
  geometry("label", "green", "32%", "9%", "auto", "auto"),
  geometry("label", "water", "68%", "37%", "auto", "auto"),
  geometry("label", "yeoksam", "79%", "72%", "auto", "auto"),
  geometry("label", "road", "38%", "83%", "auto", "auto"),
] as const

const geometryStyle = (item: Geometry): GeometryStyle => ({
  "--geo-block": item.block,
  "--geo-inline": item.inline,
  "--geo-rotate": item.rotate ?? "0deg",
  "--geo-x": item.x,
  "--geo-y": item.y,
})

const dataAttribute = (
  kind: GeometryKind,
):
  | "data-map-area"
  | "data-map-block"
  | "data-map-junction"
  | "data-map-label"
  | "data-map-road"
  | "data-map-water" =>
  kind === "area"
    ? "data-map-area"
    : kind === "parcel"
      ? "data-map-block"
      : kind === "junction"
        ? "data-map-junction"
        : kind === "label"
          ? "data-map-label"
          : kind === "road"
            ? "data-map-road"
            : "data-map-water"

const geometryClass: Readonly<Record<GeometryKind, string>> = {
  area: styles["paperArea"] ?? "paperArea",
  junction: styles["paperJunction"] ?? "paperJunction",
  label: styles["paperLabel"] ?? "paperLabel",
  parcel: styles["paperParcel"] ?? "paperParcel",
  road: styles["paperRoad"] ?? "paperRoad",
  water: styles["paperWater"] ?? "paperWater",
}

export function FallbackFieldGuide() {
  return (
    <div aria-hidden="true" className={styles["paperMap"]} data-field-guide-map>
      {GEOGRAPHY.map((item) => {
        const attribute = dataAttribute(item.kind)
        return (
          <span
            className={geometryClass[item.kind]}
            key={`${item.kind}-${item.id}`}
            style={geometryStyle(item)}
            {...{ [attribute]: item.id }}
          >
            {item.kind === "label"
              ? item.id === "gangnam"
                ? "강남역"
                : item.id === "yeoksam"
                  ? "역삼역"
                  : item.id === "green"
                    ? "도심 녹지"
                    : item.id === "water"
                      ? "수변 녹지"
                      : "주요 도로"
              : null}
          </span>
        )
      })}
    </div>
  )
}
