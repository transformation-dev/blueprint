import { Tree } from '../../src/tree.js'

export class TreeForTesting extends Tree {
  constructor(state, env) {
    const config = {
      rootNodeType: 'temporal-entity',
      rootNodeVersion: 'v1',
      nodeType: 'temporal-entity',
      nodeVersion: 'v1',
      nodeDOEnvNamespace: 'DO_API',  // TODO: Make it possible to pass in something here to indicate that we're in testing mode so the tree can use a local stub (like we import DurableAPI directly) instead of a miniflare supplied one
    }
    super(state, env, config)
  }
}
