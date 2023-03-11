/* eslint-disable import/no-unresolved */
// 3rd party imports
import { load as yamlLoad } from 'js-yaml'

// monorepo imports
// import { throwIfNotDag, throwIf, throwUnless } from '@transformation-dev/cloudflare-do-utils'  // so you can use them in validation

// local imports
import rootOrgTreeNodeSchemaV1String from './schemas/root-org-tree-node.v1.yaml?raw'  // uses vite's ?raw feature to inline as string
import orgTreeNodeSchemaV1String from './schemas/org-tree-node.v1.yaml?raw'

// initialize imports
const rootOrgTreeNodeSchemaV1 = yamlLoad(rootOrgTreeNodeSchemaV1String)  // convert yaml string to javascript object
const orgTreeNodeSchemaV1 = yamlLoad(orgTreeNodeSchemaV1String)  // convert yaml string to javascript object

export default {
  '***test-type-in-subclass***': {
    '***test-property-in-type-in-subclass***': true,
  },
  'root-org-tree-node': { versions: { v1: { schema: rootOrgTreeNodeSchemaV1 } } },
  'org-tree-node': { versions: { v1: { schema: orgTreeNodeSchemaV1 } } },
}
