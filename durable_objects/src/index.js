// 3rd party imports

// mono-repo imports
import { VersioningTransactionalDOWrapper } from '@transformation-dev/cloudflare-do-utils'

// local imports
import typeConfig from './types.js'

// Worker that does nothing and is never used but necessary since durable objects require a Worker
export default {}

// Durable Object
export class DurableAPI extends VersioningTransactionalDOWrapper {  // TODO: Find a way to do this with configuration rather than subclassing
  constructor(state, env) {
    super(state, env, typeConfig)
  }
}
