// 3rd party imports
import { Encoder, decode } from 'cbor-x'

// local imports
import { HTTPError } from './http-error.js'

export class FetchProcessor {
  constructor(idString) {
    this.idString = idString
  }

  static contentTypes = {}

  static registerContentType(contentTypeArray, processors) {  // processors = { serialize, deserialize }
    for (const contentType of contentTypeArray) {
      this.contentTypes[contentType] = processors
    }
  }
}

// CBOR
const cborSC = new Encoder({ structuredClone: true })
async function serializeCBOR(o) {
  try {
    const u8a = cborSC.encode(o)
    return u8a
  } catch (e) {
    throw new HTTPError(`Error encoding the supplied body: ${e.message}`, 500)
  }
}
async function deserializeCBOR(request) {
  try {
    const ab = await request.arrayBuffer()
    const u8a = new Uint8Array(ab)
    const o = decode(u8a)
    return o
  } catch (e) {
    throw new HTTPError('Error decoding your supplied body. Encode with npm package cbor-x using structured clone extension.', 415)
  }
}
const processorsCBOR = { serialize: serializeCBOR, deserialize: deserializeCBOR }
FetchProcessor.registerContentType(['application/cbor-sc', 'application/cbor'], processorsCBOR)
