class StorageMock {
  constructor(initialData = {}) {
    this.data = structuredClone(initialData)
  }

  async put(key, value) {
    this.data[key] = structuredClone(value)
  }

  async get(key) {
    return structuredClone(this.data[key])
  }
}
export function getStateMock(initialData = {}) {
  return { storage: new StorageMock(initialData) }
}

export async function getEnvMock(additional = { DEBUG: 'blueprint:*', DEBUG_COLORS: 1 }) {
  const env = {}
  if (globalThis.crypto == null) {
    try {
      globalThis.crypto = await import('crypto')
    } catch (err) {
      throw new Error('crypto support not available!')
    }
  }
  env.crypto = globalThis.crypto
  return { ...env, ...additional }
}
