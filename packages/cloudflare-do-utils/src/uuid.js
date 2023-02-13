// local imports
import { throwIf } from './throws.js'

// eslint-disable-next-line consistent-return
export function getUUID(env) {
  if (env.crypto?.randomUUID) return env.crypto.randomUUID()
  if (crypto?.randomUUID) return crypto.randomUUID()
  else throwIf(true, 'crypto.randomUUID() not in the environment', 500)
}
