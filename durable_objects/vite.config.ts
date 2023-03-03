import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    sourcemap: true,
    outDir: '.',
    lib: {
      entry: 'src/index.js',
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.mjs`,
    },
  },
})
