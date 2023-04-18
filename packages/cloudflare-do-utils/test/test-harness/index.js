// 3rd party imports

// mono-repo imports
import { VersioningTransactionalDOWrapper } from '../../src/versioning-transactional-do-wrapper.js'
import peopleLookup from '../../src/people-lookup.js'

// local imports
import typeConfig from './types.js'

// Worker that does nothing and is never used but necessary since durable objects require a Worker
export default peopleLookup

// Durable Object
export class DurableAPI extends VersioningTransactionalDOWrapper {
  constructor(state, env) {
    super(state, env, typeConfig)
  }
}
