/* eslint-disable import/no-unresolved */
// 3rd party imports
import { load as yamlLoad } from 'js-yaml'

// monorepo imports
import { throwIfNotDag } from '../../src/throws.js'
import { TemporalEntity } from '../../src/temporal-entity.js'
import { Tree } from '../../src/tree.js'
import { List } from '../../src/list.js'

// local imports
import { TransactionalTester } from './transactional-tester.js'
import testDagSchemaV1String from './schemas/***test-dag***.v1.yaml?raw'  // uses vite's ?raw feature to inline as string

// initialize imports
const testDagSchemaV1 = yamlLoad(testDagSchemaV1String)  // convert yaml string to javascript object

/*
 * ## Types and versions
 *
 *       static types = {
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
  'temporal-entity': {
    versions: {
      v1: {
        environments: { '*': { TheClass: TemporalEntity } },
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
        disableUseOfTransaction: true,
        environments: {
          preview: {
            TheClass: TransactionalTester,
          },
          production: null,
          '*': {
            TheClass: TransactionalTester,
          },
        },
      },
    },
  },
  'tree-for-testing': {
    versions: {
      v1: {
        rootNodeType: 'temporal-entity',
        rootNodeVersion: 'v1',
        nodeType: 'temporal-entity',
        nodeVersion: 'v1',
        doBinding: 'DO_API',
        environments: { '*': { TheClass: Tree } },
      },
    },
  },
  'list-for-testing': {
    versions: {
      v1: {
        elementType: 'temporal-entity',
        elementVersion: 'v1',
        stubFields: ['name', 'emailAddresses'],
        doBinding: 'DO_API',
        environments: { '*': { TheClass: List } },
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
  '***test-dag***': {
    versions: {
      v1: {
        schema: testDagSchemaV1,
        additionalValidation: (value) => {
          throwIfNotDag(value.dag)
        },
        environments: { '*': { TheClass: TemporalEntity } },
      },
    },
  },
  '***test-supress-previous-values***': {
    versions: {
      v1: {
        supressPreviousValues: true,
        environments: { '*': { TheClass: TemporalEntity } },
      },
    },
  },
}

export default { types, defaultTypeVersionConfig }
