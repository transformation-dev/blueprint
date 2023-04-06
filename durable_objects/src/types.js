/* eslint-disable import/no-unresolved */
// 3rd party imports
import { load as yamlLoad } from 'js-yaml'

// monorepo imports
import { TemporalEntity, Tree } from '@transformation-dev/cloudflare-do-utils'

// local imports
import { Experimenter } from './experimenter.js'
import rootOrgTreeNodeSchemaV1String from './schemas/root-org-tree-node.v1.yaml?raw'  // uses vite's ?raw feature to inline as string
import orgTreeNodeSchemaV1String from './schemas/org-tree-node.v1.yaml?raw'

// initialize imports
const rootOrgTreeNodeSchemaV1 = yamlLoad(rootOrgTreeNodeSchemaV1String)  // convert yaml string to javascript object
const orgTreeNodeSchemaV1 = yamlLoad(orgTreeNodeSchemaV1String)  // convert yaml string to javascript object

/*
 * ## Types and versions
 *
 *       types = {
 *         'widget': {
 *           versions: {
 *             v1: {  // "v#" is just an example. The version can be anything you want
 *               supressPreviousValues: true,     // defaults to false if not specified
 *               granularity: 'minute',           // defaults to 'hour' if not specified
 *               schema: widgetSchemaV1,          // example of imported schema
 *               additionalValidation: (value) => {
 *                 throwIfNotDag(value.dag)
 *               },
 *             },
 *             v2: {  // the order rather than the integer is significant for upgrades and downgrades
 *               ...
 *               upgrade: (priorVersionValueAndMeta) => {...},      // returns the upgraded from v1 { value, meta }
 *               downgrade: (currentVersionValueAndMeta) => {...},  // returns the downgraded to v1 { value, meta }
 *             },
 *           },
 *         },
 *         'zorch': {
 *           versions: {
 *             v1: {
 *               schema: {  // example of inline schema
 *                 type: 'object',
 *                 properties: {
 *                   foo: { type: 'string' },
 *                 },
 *               },
 *             },
 *           },
 *         },
 *       }
 */

const defaultTypeVersionConfig = {
  supressPreviousValues: false,
  granularity: 'hour',
  schema: null,
  additionalValidation: null,
  passFullUrl: false,
  disableUseOfTransaction: false,
}

// TemporalEntity is TheClass for many different types below but they can still have different schemas, validation, migrations, etc.
const types = {
  experimenter: {
    versions: {
      v1: {
        environments: { '*': { TheClass: Experimenter } },
      },
    },
  },
  'org-tree': {
    versions: {
      v1: {
        rootNodeType: 'root-org-tree-node',
        rootNodeVersion: 'v1',
        nodeType: 'org-tree-node',
        nodeVersion: 'v1',
        nodeDOEnvNamespace: 'DO_API',
        environments: { '*': { TheClass: Tree } },
      },
    },
  },
  'root-org-tree-node': {
    versions: {
      v1: {
        schema: rootOrgTreeNodeSchemaV1,
        environments: { '*': { TheClass: TemporalEntity } },
      },
    },
  },
  'org-tree-node': {
    versions: {
      v1: {
        schema: orgTreeNodeSchemaV1,
        environments: { '*': { TheClass: TemporalEntity } },
      },
    },
  },
}

export default { defaultTypeVersionConfig, types }
