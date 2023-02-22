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

  // server: {
  //   port: 3000,
  //   hmr: false,
  //   // hrm: {
  //   //   strictPort: true,
  //   //   port: 3002,
  //   //   clientPort: 3000,
  //   // },
  // },

  // preview: {
  //   port: 3001,
  // },
})
