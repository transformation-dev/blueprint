[![Cypress Tests](https://github.com/transformation-dev/blueprint/actions/workflows/coverage-on-pr.yml/badge.svg)](https://github.com/transformation-dev/blueprint/actions/workflows/coverage-on-pr.yml)

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=transformation-dev_blueprint&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=transformation-dev_blueprint)

This is the repository for [Transformation Blueprint](https://transformation.dev/faq) (previously named MatrX)

## Development

To get started developing:

  1. Fork and pull the repository
  2. Install dependencies with `npm install`
  3. Run `npm run dev:durable_objects` to start a re-bundle on save for the `./durable_objects` folder 
  4. In another terminal window run `npm run dev`. This will re-bundle on save both the UI code as well as the endpoints in `./functions` and hot reload them in both the server and the browser. It will also watch for re-bundles of `./durable_objects` and hot reload those.
