import path from 'path'
import { defineConfig } from "vitest/config"

const scriptPath = path.join(__dirname, "test/test-harness/dist/index.mjs")

export default defineConfig({
  test: {
    silent: false,
    coverage: {
      all: true,
      exclude: [
        // "**/pages-do-proxy.js"
      ],
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
      kvNamespaces: ["PEOPLE_LOOKUP"],
      modules: true,
      scriptPath: scriptPath,
      durableObjects: {
        DO_API: "DurableAPI",
      },
    },
  },
})
