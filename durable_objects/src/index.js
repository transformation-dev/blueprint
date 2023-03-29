// 3rd party imports

// mono-repo imports
import { VersioningTransactionalDOWrapperBase } from '@transformation-dev/cloudflare-do-utils'

// local imports
import types from './types.js'

// Worker that does nothing and is never used but necessary since durable objects require a Worker
export default {}

// Durable Object
export class DurableAPI extends VersioningTransactionalDOWrapperBase {  // TODO: Find a way to do this with configuration rather than subclassing
  static types = types
}
