import { Encoder } from 'cbor-x'

import Accept from '@transformation-dev/accept'

const cborSC = new Encoder({ structuredClone: true })
const MEDIA_TYPES_SUPPORTED = ['application/cbor-sc']  // cbor-sc is my name for cbor with structuredClone extension

export class HTTPError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }

  toJSON() {
    return { type: 'HTTPError', message: this.message, status: this.status }
  }
}

export function throwIf(condition, message, status = 400) {
  if (condition) {
    throw new HTTPError(message, status)  // TODO: Change to HTTPError from utils
  }
}

export function throwUnless(condition, message, status = 400) {
  throwIf(!condition, message, status)
}

export function contentTypeHeaderInvalid(request) {
  const contentType = request.headers.get('Content-Type')
  const mediaType = Accept.mediaType(contentType, MEDIA_TYPES_SUPPORTED)
  if (!mediaType) {
    return new Response(`The Content-Type for the incoming body, ${JSON.stringify(contentType)}, is unsupported`, { status: 415 })
  }
  return false
}

export function acceptHeaderInvalid(request) {
  const accept = request.headers.get('Accept')
  const mediaType = Accept.mediaType(accept, MEDIA_TYPES_SUPPORTED)
  if (!mediaType) {
    return new Response(`None of your supplied Accept media types, ${JSON.stringify(accept)}, are supported`, { status: 406 })
  }
  return false
}

export function mediaTypeHeaderInvalid(request) {
  return contentTypeHeaderInvalid(request) || acceptHeaderInvalid(request)
}

export async function decodeCBORSC(request) {
  const ab = await request.arrayBuffer()
  const u8a = new Uint8Array(ab)
  const o = cborSC.decode(u8a)
  return o
}
