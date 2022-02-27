import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import istanbul from 'vite-plugin-istanbul'

// https://vitejs.dev/config/
export default defineConfig({
  mode: 'development',
  plugins: [
    svelte(),
    istanbul({
      include: ['src', 'durable_objects', 'functions', 'packages'],
      exclude: ['node_modules', 'cypress'],
      extension: [ '.js', '.ts', '.svelte' ],
      forceBuildInstrument: true,  // May not need this or may not even need this file if cypress triggers an instrumented build
      cypress: true,
    }),
  ],
  css: {
    preprocessorOptions: {
      scss: {
        charset: false,  // fixes "@charset" must be the first rule in the file" warnings
      },
    },
  },

  preview: {
    port: 3001,
  },
})
