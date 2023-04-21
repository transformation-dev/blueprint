// 3rd party imports

// mono-repo imports
import { VersioningTransactionalDOWrapper } from '../../src/versioning-transactional-do-wrapper.js'
import { getPersonLookupFetch, getPersonLookupFetchPartialPartial } from '../../src/people-lookup.js'

// local imports
import typeConfig from './types.js'

const personType = 'person-for-testing'
const personVersion = 'v1'
// const personTypeVersionConfig = typeConfig.types[personType].versions[personVersion]  // TODO: Replace this with the one that sets defaults get-type-version-config

// Worker that does nothing and is never used but necessary since durable objects require a Worker
export default {
  fetch: getPersonLookupFetch(typeConfig, personType, personVersion),
  getFetchPartial: getPersonLookupFetchPartialPartial(typeConfig, personType, personVersion),  // only needed for testing
}

// Durable Object
export class DurableAPI extends VersioningTransactionalDOWrapper {
  constructor(state, env) {
    super(state, env, typeConfig)
  }
}
