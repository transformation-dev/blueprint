import { defineConfig } from 'vite'
// eslint-disable-next-line import/no-unresolved
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

  // server: {  // https://vitejs.dev/config/#server-options
  //   port: 3000,
  //   hmr: false,  // hmr was flacky because wrangler pages dev doesn't proxy websockets well, so I now use vite watch mode instead of vite dev mode
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
