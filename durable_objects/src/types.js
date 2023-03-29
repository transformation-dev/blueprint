/* eslint-disable import/no-unresolved */
// 3rd party imports
import { load as yamlLoad } from 'js-yaml'

// monorepo imports
// import { throwIfNotDag, throwIf, throwUnless } from '@transformation-dev/cloudflare-do-utils'  // so you can use them in validation

// local imports
import { Experimenter } from './experimenter.js'
import { TransactionalTester } from './transactional-tester.js'
import { TemporalEntity } from './temporal-entity.js'
import { Tree } from './tree.js'
import rootOrgTreeNodeSchemaV1String from './schemas/root-org-tree-node.v1.yaml?raw'  // uses vite's ?raw feature to inline as string
import orgTreeNodeSchemaV1String from './schemas/org-tree-node.v1.yaml?raw'

// initialize imports
const rootOrgTreeNodeSchemaV1 = yamlLoad(rootOrgTreeNodeSchemaV1String)  // convert yaml string to javascript object
const orgTreeNodeSchemaV1 = yamlLoad(orgTreeNodeSchemaV1String)  // convert yaml string to javascript object

/*
 * ## Types and versions
 *
 *       static types = {
 *         'widget': {
 *           versions: {
 *             v1: {  // each version must start with 'v' but you can use anything after that
 *               supressPreviousValues: true,     // defaults to false if not specified
 *               granularity: 'minute',           // defaults to 'hour' if not specified
 *               schema: widgetSchemaV1,
 *               additionalValidation(value) {
 *                 throwIfNotDag(value.dag)
 *               },
 *             },
 *             v2: {  // the order rather than the integer is significant for upgrades and downgrades
 *               ...
 *               upgrade: (priorVersionValueAndMeta) => {...},  // returns the upgraded from v1 { value, meta }
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

// TemporalEntity is TheClass for many different types below but they can still have different schemas, validation, migrations, etc.
export default {
  '*': {  // These are the defaults for settings used below but also allows you to make calls like /*/*/foo which can be useful for testing
    versions: {
      '*': {
        granularity: 3600000,  // 1 hour
        environments: {
          '*': {
            TheClass: TemporalEntity,  // Let TemporalEntity handle the type and version
            flags: {
              passFullUrl: true,  // false will strip the type and version segments which allows you to use many DOs as-is
            },
          },
        },
      },
    },
  },
  experimenter: {
    versions: {
      v1: {
        environments: { '*': { TheClass: Experimenter } },
      },
    },
  },
  'transactional-tester': {
    versions: {
      'with-transaction': {
        environments: {
          preview: { TheClass: TransactionalTester },
          production: null,  // null means it's not available in production yet  TODO: Test this
          '*': { TheClass: TransactionalTester },
        },
      },
      'without-transaction': {
        environments: {
          preview: {
            TheClass: TransactionalTester,
            flags: { disableUseOfTransaction: true },
          },
          production: null,
          '*': {
            TheClass: TransactionalTester,
            flags: { disableUseOfTransaction: true },
          },
        },
      },
    },
  },
  tree: {
    versions: {
      v1: {
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
  '***test-granularity***': {
    versions: {
      v1: {
        granularity: 'second',
        environments: { '*': { TheClass: TemporalEntity } },
      },
    },
  },
}
