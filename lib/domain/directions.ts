export type ProductionDirections = {
  readonly kind: "route"
  readonly source: "naver_route"
  readonly url: string
}

const isFiniteCoordinate = (value: number): boolean => Number.isFinite(value)

type NaverRouteDestination = {
  readonly latitude: number
  readonly longitude: number
  readonly name: string
}

export const buildNaverRouteDirections = ({
  latitude,
  longitude,
  name,
}: NaverRouteDestination): ProductionDirections | undefined => {
  if (!isFiniteCoordinate(latitude) || !isFiniteCoordinate(longitude)) return undefined
  const query = new URLSearchParams({
    elng: String(longitude),
    elat: String(latitude),
    etext: name,
    menu: "route",
  })
  return {
    kind: "route",
    source: "naver_route",
    url: `https://map.naver.com/index.nhn?${query.toString()}`,
  }
}
