import { Encoder } from 'cbor-x'

import Accept from '@transformation-dev/accept'

const cborSC = new Encoder({ structuredClone: true })
const MEDIA_TYPES_SUPPORTED = ['application/cbor-sc']  // cbor-sc is my name for cbor with structuredClone extension

export class HTTPError extends Error {
  constructor(message, status, body) {
    super(message)
    this.status = status
    if (body) {
      if (typeof body === 'object') {
        this.body = structuredClone(body)
        this.body.error = { message, status }
      } else {
        this.body = body
      }
    } else {
      this.body = { error: { message, status } }
    }
  }
}

export function throwIf(condition, message, status = 400, body = null) {
  if (condition) {
    throw new HTTPError(message, status, body)
  }
}

export function throwUnless(condition, message, status = 400, body = null) {
  throwIf(!condition, message, status, body)
}

export function throwIfContentTypeHeaderInvalid(request) {
  const contentType = request.headers.get('Content-Type')
  const mediaType = Accept.mediaType(contentType, MEDIA_TYPES_SUPPORTED)
  throwUnless(mediaType, `The Content-Type for the incoming body, ${JSON.stringify(contentType)}, is unsupported`, 415)
}

export function throwIfAcceptHeaderInvalid(request) {
  const accept = request.headers.get('Accept')
  const mediaType = Accept.mediaType(accept, MEDIA_TYPES_SUPPORTED)
  throwUnless(mediaType, `None of your supplied Accept media types, ${JSON.stringify(accept)}, are supported`, 406)
}

export function throwIfMediaTypeHeaderInvalid(request) {
  throwIfContentTypeHeaderInvalid(request)
  throwIfAcceptHeaderInvalid(request)
}

export async function decodeCBORSC(request) {
  try {
    const ab = await request.arrayBuffer()
    const u8a = new Uint8Array(ab)
    const o = cborSC.decode(u8a)
    return o
  } catch (e) {
    throw new HTTPError('Error decoding your supplied body. Encode with npm package cbor-x using structured clone extension.', 415)
  }
}
