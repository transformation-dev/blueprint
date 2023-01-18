import { defineConfig } from 'cypress'

export default defineConfig({
  video: false,
  defaultCommandTimeout: 3000,
  e2e: {
    // We've imported your old cypress plugins here.
    // You may want to clean this up later by importing these.
    async setupNodeEvents(on, config) {
      // eslint-disable-next-line import/extensions
      const cyPlugin = await import('./cypress/plugins/index.mjs')
      cyPlugin.default(on, config)

      return config
    },
    env: {
      TESTING_OVERRIDE_CODE: process.env.TESTING_OVERRIDE_CODE,
    },
    baseUrl: 'http://localhost:8788',
    // baseUrl: 'https://create-do-user.transformation.pages.dev',
  },
})
