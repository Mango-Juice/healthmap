import fs from "node:fs/promises"

const directory = new URL("../../public/category-icons/", import.meta.url)
await fs.mkdir(directory, { recursive: true })
for (const category of ["salad_poke", "grilled_steamed", "whole_grain", "plant_based", "rice"]) {
  const source = await fs.readFile(
    new URL(`../../public/markers/food-map-${category}.svg`, import.meta.url),
    "utf8",
  )
  const cropped = source.replace(
    'width="40" height="48" viewBox="0 0 40 48"',
    'width="35" height="44" viewBox="2.5 0.5 35 44"',
  )
  if (cropped === source) throw new Error(`Unexpected marker dimensions: ${category}`)
  await fs.writeFile(new URL(`${category}.svg`, directory), cropped)
}
