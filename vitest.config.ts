import path from 'path'
import { defineConfig } from "vitest/config"

const scriptPath = path.join(__dirname, "packages/cloudflare-do-utils/test/test-harness/dist/index.mjs")

export default defineConfig({
  test: {
    silent: false,
    coverage: {
      all: true,
      exclude: [
        // "**/pages-do-proxy.js"
      ],
      include: [
        'packages/**/src/**/*.js',
        'durable_objects/**/src/**/*.js',
      ],
      provider: 'c8',
      // provider: 'istanbul',
      reporter: [
        'lcov',
        'html',
        'text',
      ]
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
