// 3rd party imports
import { Encoder, decode } from 'cbor-x'

// local imports
import { HTTPError } from './http-error.js'
import { throwIf } from './throws.js'

export class FetchProcessor {
  constructor(parentThis, idString, request) {
    this.parentThis = parentThis
    this.idString = idString
    this.request = request

    this.responseContentType = 'application/cbor'  // TODO: Use Accept header

    this.warnings = []
  }

  static contentTypes = {}

  static registerContentType(contentTypeArray, processors) {  // processors = { serialize, deserialize }
    for (const contentType of contentTypeArray) {
      this.contentTypes[contentType] = processors
    }
  }

  response(body, status = 200, statusText = undefined) {
    const headers = new Headers()
    headers.set('Content-ID', this.idString)
    if (statusText != null) {
      const cleanedStatusText = statusText.replaceAll('\n', ' ')  // newlines are not allowed in HTTP headers
      headers.set('Status-Text', cleanedStatusText)  // HTTP/2 requires Status-Text match the status, but this seems to work for now in Cloudflare TODO: Test this
    }
    if (body != null) {
      headers.set('Content-Type', this.responseContentType)
      if (typeof body === 'object') {
        const newBody = structuredClone(body)  // TODO: C - Consider not cloning in production or preview
        newBody.idString = this.idString
        if (statusText != null) newBody.statusText = statusText
        if (this.warnings.length > 0) newBody.warnings = this.warnings
        return new Response(this.serialize(newBody), { status, headers })
      }
    }
    return new Response(body, { status, headers })  // assumes body is already serialized or nullish
  }

  async serialize(o, contentType = this.responseContentType) {
    try {
      const { serialize } = this.constructor.contentTypes[contentType]
      return serialize(o)
    } catch (e) {
      throw new HTTPError(`Error serializing the supplied body: ${e.message}`, 500)
    }
  }

  async deserialize(requestOrResponse = this.request) {
    const contentType = requestOrResponse.headers.get('Content-Type')
    throwIf(contentType == null, 'No Content-Type header supplied', 400)
    try {
      const { deserialize } = this.constructor.contentTypes[contentType]
      return deserialize(requestOrResponse)
    } catch (e) {
      throw new HTTPError(`Error serializing the supplied body: ${e.message}`, 500)
    }
  }
}

// Register CBOR
const cborSC = new Encoder({ structuredClone: true })
async function serializeCBOR(o) {
  return cborSC.encode(o)
}
async function deserializeCBOR(requestOrResponse) {
  const ab = await requestOrResponse.arrayBuffer()
  if (ab.byteLength === 0) return null
  const u8a = new Uint8Array(ab)
  return decode(u8a)
}
const processorsCBOR = { serialize: serializeCBOR, deserialize: deserializeCBOR }
FetchProcessor.registerContentType(['application/cbor', 'application/cbor-sc'], processorsCBOR)  // since cbor is first, it is the default

// Register JSON
async function serializeJSON(o) {
  return JSON.stringify(o)
}
async function deserializeJSON(requestOrResponse) {
  return requestOrResponse.json()
}
const processorsJSON = { serialize: serializeJSON, deserialize: deserializeJSON }
FetchProcessor.registerContentType(['application/json'], processorsJSON)

// TODO: Register text
