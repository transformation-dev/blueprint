/* eslint-disable no-param-reassign */
export async function addCryptoToEnv(env) {
  if (globalThis.crypto == null) {
    try {
      env.crypto = await import('crypto')
    } catch (err) {
      throw new Error('crypto support not available!')
    }
  } else {
    env.crypto = globalThis.crypto
  }
  return env
}
