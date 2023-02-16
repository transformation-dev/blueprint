// TODO: Turn this into a class, Serialization, that can be instantiated with a map of contentType to serialize/deserialize functions.

// 3rd party imports
import { Encoder } from 'cbor-x'

// local imports
import { HTTPError } from './http-error.js'

// iniialize imports
const cborSC = new Encoder({ structuredClone: true })

export function serialize(o, contentType) {
  if (contentType === 'application/cbor-sc') {
    try {
      const u8a = cborSC.encode(o)
      return u8a
    } catch (e) {
      throw new HTTPError(`Error encoding the supplied body: ${e.message}`, 500)
    }
  } else if (contentType === 'application/json') {
    return JSON.stringify(o)
  } else {
    return o
  }
}
