import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  css: {
    preprocessorOptions: {
      scss: {
        charset: false, // fixes "@charset" must be the first rule in the file" warnings
      },
    },
  },
})
