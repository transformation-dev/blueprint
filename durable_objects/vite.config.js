// eslint-disable-next-line import/no-extraneous-dependencies
import { defineConfig } from 'vite'
import path from 'path'
import ViteYaml from '@modyfi/vite-plugin-yaml'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    ViteYaml(),
  ],
  build: {
    outDir: __dirname,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, 'src/index.js'),
      name: 'index',
      formats: ['es'],
      fileName: (format) => {
        if (format === 'es') return 'index.mjs'
        else return 'not-used'
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
