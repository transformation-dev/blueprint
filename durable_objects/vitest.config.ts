import path from 'path'
import { defineConfig } from "vitest/config"

const scriptPath = path.join(__dirname, "dist/index.mjs")

export default defineConfig({
  test: {
    silent: false,
    verbose: true,
    coverage: {
      all: true,
      include: [
        'src/**/*.js',
      ],
      provider: 'c8',
      // provider: 'istanbul',
    },
    environment: "miniflare",
    // Configuration is automatically loaded from `.env`, `package.json` and
    // `wrangler.toml` files by default, but you can pass any additional Miniflare
    // API options here:
    environmentOptions: {
      // bindings: { KEY: "value" },
      kvNamespaces: ["PEOPLE_LOOKUP"],  // TODO: Don't forget to add this to the Pages config and wrangler.toml
      modules: true,
      scriptPath: scriptPath,
      durableObjects: {
        DO_API: "DurableAPI",
      },
    },
  },
})
