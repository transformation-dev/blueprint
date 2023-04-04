import { Tree } from '../../src/tree.js'

export class TreeForTesting extends Tree {
  constructor(state, env) {
    const config = {
      rootNodeType: 'temporal-entity',
      rootNodeVersion: 'v1',
      nodeType: 'temporal-entity',
      nodeVersion: 'v1',
      nodeDOEnvNamespace: 'DO_API',
    }
    super(state, env, config)
  }
}
