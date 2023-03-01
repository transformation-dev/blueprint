import path from 'path'
import { defineConfig } from "vitest/config"

const scriptPath = path.join(__dirname, "durable_objects/index.mjs")

export default defineConfig({
  test: {
    coverage: {
      // provider: 'c8',
      provider: 'istanbul',
      exclude: [
        'node_modules/**',
        'coverage/**',
        'dist/**',
        'packages/*/test{,s}/**',
        '**/*.d.ts',
        'cypress/**',
        'test{,s}/**',
        'test{,-*}.{js,cjs,mjs,ts,tsx,jsx}',
        '**/*{.,-}test.{js,cjs,mjs,ts,tsx,jsx}',
        '**/*{.,-}spec.{js,cjs,mjs,ts,tsx,jsx}',
        '**/__tests__/**',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
        '**/.{eslint,mocha,prettier}rc.{js,cjs,yml}',
      ]
    },
    // setupFiles: [
    //   path.join(__dirname, "test/_global-crypto.js"),
    // ],
    environment: "miniflare",
    // Configuration is automatically loaded from `.env`, `package.json` and
    // `wrangler.toml` files by default, but you can pass any additional Miniflare
    // API options here:
    environmentOptions: {
      // bindings: { KEY: "value" },
      // bindings: {
      //   crypto
      // },
      // kvNamespaces: ["TEST_NAMESPACE"],
      modules: true,
      scriptPath: scriptPath,
      durableObjects: {
        DO_API: "DurableAPI",
      },
    },
  },
})
