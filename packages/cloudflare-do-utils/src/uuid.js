// local imports
import { throwIf } from './throws.js'

// eslint-disable-next-line consistent-return
export function getUUID(env) {
  if (env.crypto?.randomUUID != null) return env.crypto.randomUUID()
  if (globalThis.crypto?.randomUUID != null) return globalThis.crypto.randomUUID()
  else throwIf(true, 'crypto.randomUUID() not in the environment', 500)
}
