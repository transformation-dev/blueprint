// 3rd party imports

// mono-repo imports
import { TransactionalDOWrapperBase } from '@transformation-dev/cloudflare-do-utils'

// local imports
import { Experimenter } from './experimenter.js'
import { ExperimenterV2 } from './experimenter-v2.js'
import { Counter } from './counter.js'
import { TemporalEntity } from './temporal-entity.js'
import { Tree } from './tree.js'

export * from './temporal-entity.js'  // Need this for unit testing TemporalEntity which has imported YAML schemas
export * from './tree.js'  // And this is needed because Tree uses TemporalEntity
export * from './counter.js'  // I don't think this is needed but I'm not sure

// Worker that does nothing and is never used but necessary since durable objects require a Worker
export default {}

// Durable Object
export class DurableAPI extends TransactionalDOWrapperBase {
  // Since we're using the same type and version concept and url ordering as TemporalEntity, we can defer those differences to TemporalEntity.
  // This means that TemporalEntity can be the class for many different types below but the url gets passed into TemporalEntity
  // so it would further refine the type inside of TemporalEntity. They will still have different schemas, validation, migrations, etc.
  static types = {
    '*': {  // These are the defaults for settings used below but also allows you to make calls like /*/*/foo which can be useful for testing
      versions: {
        '*': {
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
        v2: {
          environments: {
            preview: { TheClass: ExperimenterV2 },
            production: null,  // null means it's not available in production yet  TODO: Test this
            '*': { TheClass: ExperimenterV2 },
          },
        },
        v3: {
          environments: {
            preview: {
              TheClass: ExperimenterV2,
              flags: { disableUseOfTransaction: true },
            },
            production: null,
            '*': {
              TheClass: ExperimenterV2,
              flags: { disableUseOfTransaction: true },
            },
          },
        },
      },
    },
    'temporal-entity': {
      versions: {
        v1: {
          environments: { '*': { TheClass: TemporalEntity } },
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
    counter: {
      versions: {
        v1: {
          environments: {
            '*': {
              TheClass: Counter,
              flags: {
                passFullUrl: false,  // false is the default but it's overridden in */*/* above
              },
            },
          },
        },
      },
    },
  }
}
