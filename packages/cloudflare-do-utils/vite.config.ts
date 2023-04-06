import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    sourcemap: true,
    outDir: 'test/test-harness/dist',
    lib: {
      entry: 'test/test-harness/index.js',
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.mjs`,
    },
  },
})
