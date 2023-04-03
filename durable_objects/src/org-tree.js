import { Tree } from '@transformation-dev/cloudflare-do-utils'

export class OrgTree extends Tree {
  constructor(state, env) {
    const config = {
      rootNodeType: 'root-org-tree-node',
      rootNodeVersion: 'v1',
      nodeType: 'org-tree-node',
      nodeVersion: 'v1',
      nodeDOEnvNamespace: 'DO_API',
    }
    super(state, env, config)
  }
}
