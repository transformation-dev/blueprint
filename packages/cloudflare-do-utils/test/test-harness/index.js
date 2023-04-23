// 3rd party imports

// mono-repo imports
import { VersioningTransactionalDOWrapper } from '../../src/versioning-transactional-do-wrapper.js'
import { getPersonLookupFetch, getPersonLookupFetchPartialPartial } from '../../src/people-lookup.js'

// local imports
import typeConfig from './types.js'

const personType = 'person-for-testing'
const personVersion = 'v1'
const orgTreeType = 'org-tree-for-testing'
const orgTreeVersion = 'v1'

export default {
  fetch: getPersonLookupFetch(typeConfig, personType, personVersion, orgTreeType, orgTreeVersion),
  getFetchPartial: getPersonLookupFetchPartialPartial(typeConfig, personType, personVersion, orgTreeType, orgTreeVersion),  // only needed for testing
}

// Durable Object
export class DurableAPI extends VersioningTransactionalDOWrapper {
  constructor(state, env) {
    super(state, env, typeConfig)
  }
}
