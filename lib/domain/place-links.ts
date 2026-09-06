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
