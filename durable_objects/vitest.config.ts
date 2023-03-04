import path from 'path'
import { defineConfig } from "vitest/config"

const scriptPath = path.join(__dirname, "index.mjs")

export default defineConfig({
  test: {
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
      // kvNamespaces: ["TEST_NAMESPACE"],
      modules: true,
      scriptPath: scriptPath,
      durableObjects: {
        DO_API: "DurableAPI",
      },
    },
  },
})
