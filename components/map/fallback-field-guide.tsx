import styles from "./map-discovery.module.css"

const WATERWAYS = ["river", "stream"] as const
const AREAS = ["north-green", "central-green", "east-green", "south-green"] as const
const BLOCKS = [
  "north-west-a",
  "north-west-b",
  "north-center-a",
  "north-center-b",
  "north-east-a",
  "north-east-b",
  "center-west-a",
  "center-west-b",
  "center-east-a",
  "center-east-b",
  "south-west-a",
  "south-west-b",
  "south-center-a",
  "south-center-b",
  "south-east-a",
  "south-east-b",
] as const
const ROADS = [
  "arterial-west-east",
  "arterial-north-south",
  "arterial-diagonal",
  "collector-north-a",
  "collector-north-b",
  "collector-center-a",
  "collector-center-b",
  "collector-south-a",
  "collector-south-b",
  "local-west-a",
  "local-west-b",
  "local-west-c",
  "local-center-a",
  "local-center-b",
  "local-center-c",
  "local-east-a",
  "local-east-b",
  "local-east-c",
] as const
const JUNCTIONS = ["north", "west", "center", "east", "south"] as const
const LABELS = [
  ["gangnam", "강남역"],
  ["yeoksam", "역삼역"],
  ["north", "강남 생활권"],
  ["south", "역삼 생활권"],
  ["green", "도심 녹지"],
  ["water", "수변 녹지"],
  ["road", "주요 도로"],
] as const

export function FallbackFieldGuide() {
  return (
    <div aria-hidden="true" className={styles["paperMap"]} data-field-guide-map>
      {WATERWAYS.map((waterway) => (
        <span className={styles["paperWater"]} data-map-water={waterway} key={waterway} />
      ))}
      {AREAS.map((area) => (
        <span className={styles["paperArea"]} data-map-area={area} key={area} />
      ))}
      {BLOCKS.map((block) => (
        <span className={styles["paperBlock"]} data-map-block={block} key={block} />
      ))}
      {ROADS.map((road) => (
        <span
          className={styles["paperRoad"]}
          data-map-road={road}
          data-road-tier={
            road.startsWith("arterial")
              ? "arterial"
              : road.startsWith("collector")
                ? "collector"
                : "local"
          }
          key={road}
        />
      ))}
      {JUNCTIONS.map((junction) => (
        <span className={styles["paperJunction"]} data-map-junction={junction} key={junction} />
      ))}
      {LABELS.map(([label, copy]) => (
        <span className={styles["paperLabel"]} data-map-label={label} key={label}>
          {copy}
        </span>
      ))}
    </div>
  )
}
