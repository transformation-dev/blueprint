#!/usr/bin/env node
/* eslint-disable no-unused-vars */
/* eslint-disable no-console */

import chokidar from 'chokidar'
import context from './context.mjs'

async function build(event, path) {
  if (event == null) console.log('building...')
  else console.log(`${event} changed. rebuilding...`)
  try {
    const result = await context.rebuild()
    if (result.warnings.length > 0) console.log('Build succeeded but there were warnings :-(', '\n')
    else console.log('success!', '\n')
  } catch (e) {
    // console.log('rebuild failed: ', e.message)  // not needed because esbuild prints the error
  }
}

let rebuildTimeout = null
async function rebuild(event, path) {
  if (rebuildTimeout != null) clearTimeout(rebuildTimeout)
  rebuildTimeout = setTimeout(build, 1000, event, path)
}

await build()

console.log('watching...\n')

const watcher = chokidar.watch('.', {
  atomic: true,  // this doesn't seem to debounce even when I set it to 1000 on MacOS so I implemented my own above
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
