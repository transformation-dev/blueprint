#!/usr/bin/env node
/* eslint-disable no-unused-vars */
/* eslint-disable no-console */

import context from './context.mjs'

console.log('building...')
try {
  const result = await context.rebuild()
  console.log('success!')
  console.log('warnings: ', result.warnings, '\n')
} catch (e) {
  // console.log('rebuild failed: ', e.message)  // not needed because esbuild prints the error
  process.exit(1)
} finally {
  context.dispose()
}
