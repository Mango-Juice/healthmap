import { z } from "zod"

export const CleanHttpsUrlSchema = z.url({ protocol: /^https$/ }).refine((value) => {
  const url = URL.parse(value)
  return (
    url !== null &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    !value.includes("#") &&
    !/[\s\\]/u.test(value)
  )
})
export const ExactNaverPlaceUrlSchema = CleanHttpsUrlSchema.refine((value) => {
  const url = URL.parse(value)
  if (url === null) return false
  if (url.hostname === "map.naver.com")
    return /^\/(?:p|v5)\/entry\/place\/[1-9]\d*\/?$/u.test(url.pathname)
  return (
    (url.hostname === "m.place.naver.com" || url.hostname === "pcmap.place.naver.com") &&
    /^\/(?:restaurant|place)\/[1-9]\d*(?:\/(?:home|menu|photo|review|information))?\/?$/u.test(
      url.pathname,
    )
  )
})
export const ApprovedMediaSourceUrlSchema = CleanHttpsUrlSchema.refine((value) => {
  const url = URL.parse(value)
  return (
    url !== null &&
    /^(?:(?:www\.)?(?:salady\.com|slowcali\.co\.kr)|pokeallday\.co\.kr|prepperskorea\.com)$/u.test(
      url.hostname,
    )
  )
})
export const ApprovedMediaUrlSchema = CleanHttpsUrlSchema.refine((value) => {
  const url = URL.parse(value)
  return (
    url !== null &&
    /\.(?:avif|gif|jpe?g|png|webp)$/iu.test(url.pathname) &&
    (ApprovedMediaSourceUrlSchema.safeParse(value).success ||
      (url.hostname === "prod-image-preppers.supp.fitness" && url.pathname.startsWith("/hq/")))
  )
})
