#!/usr/bin/env node
/* eslint-disable no-unused-vars */
/* eslint-disable no-console */

import context from './context.mjs'

console.log('building...')
try {
  const result = await context.rebuild()
  if (result.warnings.length > 0) console.log('Build succeeded but there were warnings :-(', '\n')
  else console.log('success!', '\n')
} catch (e) {
  process.exit(1)
} finally {
  context.dispose()
}
