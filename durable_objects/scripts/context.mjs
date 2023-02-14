import * as esbuild from 'esbuild'
import pluginYaml from 'esbuild-plugin-yaml'

const { yamlPlugin } = pluginYaml

export default await esbuild.context({
  entryPoints: ['src/index.js'],
  outfile: 'index.mjs',
  sourcemap: true,
  bundle: true,
  format: 'esm',
  target: 'esnext',
  // loader: {
  //   '.yaml': 'text',
  // },
  plugins: [
    yamlPlugin(),
  ],
})
