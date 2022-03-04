[![Cypress Tests](https://github.com/transformation-dev/blueprint/actions/workflows/coverage-on-pr.yml/badge.svg)](https://github.com/transformation-dev/blueprint/actions/workflows/coverage-on-pr.yml)

This is the repository for [Transformation Blueprint](https://transformation.dev/faq)

## Development

To get started developing:

  1. Fork and pull the repository
  2. Install dependencies with `npm install`
  3. Run `npm run dev:durable_objects` to start a re-bundle on save for the `./durable_objects` folder 
  4. In another terminal window run `npm run dev`. This will re-bundle on save both the UI code as well as the endpoints in `./functions` and hot reload them in both the server and the browser. It will also watch for re-bundles of `./durable_objects` and hot reload those.
