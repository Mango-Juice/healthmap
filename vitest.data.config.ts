import { defineConfig } from "vitest/config"

// biome-ignore lint/style/noDefaultExport: Vitest configuration contract.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/data/**/*.test.ts"],
    passWithNoTests: false,
  },
})
