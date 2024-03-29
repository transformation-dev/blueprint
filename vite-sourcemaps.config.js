import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vitejs.dev/config/
export default defineConfig({
  mode: 'development',
  build: {
    sourcemap: true,
    minify: false,
  },
  plugins: [svelte()],
  css: {
    preprocessorOptions: {
      scss: {
        charset: false, // fixes "@charset" must be the first rule in the file" warnings
      },
    },
  },
  preview: {
    port: 3001,
  },
})
