import * as esbuild from 'esbuild'

export default await esbuild.context({
  entryPoints: ['src/index.js'],
  outfile: 'index.mjs',
  sourcemap: true,
  bundle: true,
  format: 'esm',
  target: 'esnext',
  loader: {
    '.yaml': 'text',
  },
})
