#!/usr/bin/env node
/* eslint-disable no-unused-vars */
/* eslint-disable no-console */

import chokidar from 'chokidar'
import context from './context.mjs'

async function rebuild(event, path) {
  if (event == null) console.log('building...')
  else console.log(`${event} changed. rebuilding...`)
  try {
    const result = await context.rebuild()
    if (result.warnings.length > 0) console.log('Build succeeded but there were warnings :-(', '\n')
    else console.log('success!')
  } catch (e) {
    // console.log('rebuild failed: ', e.message)  // not needed because esbuild prints the error
  }
}

await rebuild()

console.log('watching...\n')

const watcher = chokidar.watch('.', {
  atomic: true,
  ignored: [
    'node_modules',
    'coverage-server',
    'test',  // although we could use this to re-run tests
    'index.mjs',
    'index.mjs.map',
    '.c8rc.json',
    'watch.mjs',
    'scripts',
  ],
})
watcher.on('change', rebuild)
