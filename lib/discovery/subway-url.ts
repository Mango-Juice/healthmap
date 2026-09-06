import { z } from "zod"

export const ExactSubwayStoreUrlSchema = z
  .url({ protocol: /^https$/, hostname: /^(?:www[.])?subway[.]co[.]kr$/ })
  .refine((value) => {
    const url = URL.parse(value)
    if (
      url === null ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== "" ||
      url.hash !== ""
    )
      return false
    if (url.pathname === "/storeSearch") return url.search === ""
    return (
      url.pathname === "/storeDetail" &&
      url.searchParams.size === 1 &&
      /^\d+$/u.test(url.searchParams.get("franchiseNo") ?? "")
    )
  })
