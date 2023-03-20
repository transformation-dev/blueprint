// 3rd party imports
import { Encoder, decode } from 'cbor-x'

// local imports
import { throwIf } from './throws.js'

export const DEFAULT_CONTENT_TYPE = 'application/cbor'
export const contentProcessors = {}

// itty-router middleware which cannot have a return.
export async function withAdvancedContent(request) {
  const contentType = request.headers.get('Content-Type')
  throwIf(contentType == null, 'No Content-Type header supplied', 400)
  const { deserialize } = contentProcessors[contentType]
  throwIf(deserialize == null, `Unknown Content-Type header: ${contentType}`)
  request.content = await deserialize(request)
}

// Same as above except it returns the request to match the signature of the remainder of these functions.
export async function requestIn(request) {
  await withAdvancedContent(request)
  return request
}

export async function requestOut(input, inputOptions) {
  if (input instanceof Request) return input
  const url = input

  let options
  if (inputOptions != null) options = inputOptions
  else options = {}

  let headers
  if (options.headers != null) {
    headers = new Headers(options.headers)
  } else {
    headers = new Headers()
  }

  if (options.body) {
    let contentType
    if (headers.has('Content-Type')) {
      contentType = headers.get('Content-Type')
    } else {
      contentType = DEFAULT_CONTENT_TYPE
      headers.set('Content-Type', contentType)
    }
    const { serialize } = contentProcessors[contentType]
    throwIf(serialize == null, `Unknown Content-Type header: ${contentType}`)
    options.body = await serialize(options.body)
  }

  if (!headers.has('Accept')) {
    headers.set('Accept', DEFAULT_CONTENT_TYPE)
  }
  options.headers = headers

  return new Request(url, options)
}

// returns a Response
export async function responseOut(body, status = 200, contentType = DEFAULT_CONTENT_TYPE, additionalHeaders = undefined) {
  let headers
  if (additionalHeaders instanceof Headers) headers = additionalHeaders
  else headers = new Headers()
  if (body != null) {
    headers.set('Content-Type', contentType)
    if (ArrayBuffer.isView(body)) {  // Assumes it's already been serialized regardless of contentType
      return new Response(body, { status, headers })
    } else {
      const { serialize } = contentProcessors[contentType]
      throwIf(serialize == null, `Unknown Content-Type header: ${contentType}`)
      return new Response(await serialize(body), { status, headers })
    }
  }
  return new Response(undefined, { status, headers })
}

export function errorResponseOut(e, env, idString) {
  const body = e.body ?? {}
  body.error = { message: e.message, status: e.status }
  if (env?.CF_ENV !== 'production') {
    body.error.stack = e.body?.error?.stack ?? ''
    body.error.stack += e.stack
  }
  body.idString = idString
  return responseOut(body, e.status ?? 500)
}

export async function responseIn(response) {
  const contentType = response.headers.get('Content-Type') ?? DEFAULT_CONTENT_TYPE
  const { deserialize } = contentProcessors[contentType]
  throwIf(deserialize == null, `Unknown Content-Type header: ${contentType}`)
  response.content = await deserialize(response)
  return response
}

export async function requestOutResponseIn(url, options, stub, state) {
  const request = await requestOut(url, options)

  let response
  if (stub != null) {
    if (state != null && globalThis.runWithMiniflareDurableObjectGates != null) {  // Means we must be running tests in miniflare
      response = await globalThis.runWithMiniflareDurableObjectGates(state, () => stub.fetch(request))  // I hope this allows console.log's to finish before vitest exits
    } else {
      response = await stub.fetch(request)
    }
  } else {
    response = await fetch(request)
  }

  return responseIn(response)
}

function registerContentProcessors(contentTypeArray, processors) {  // processors = { serialize, deserialize }
  for (const contentType of contentTypeArray) {
    contentProcessors[contentType] = processors
  }
}

// export class BodyProcessor {
//   constructor(defaultContentType = 'application/cbor') {
//     this.defaultContentType = defaultContentType
//   }

//   static contentProcessors = {}

//   static registerContentProcessors(contentTypeArray, processors) {  // processors = { serialize, deserialize }
//     for (const contentType of contentTypeArray) {
//       this.contentProcessors[contentType] = processors
//     }
//   }

//   response(body, status = 200, statusText = undefined) {
//     const headers = new Headers()
//     headers.set('Content-ID', this.idString)
//     if (statusText != null) {
//       const cleanedStatusText = statusText.replaceAll('\n', ' ')  // newlines are not allowed in HTTP headers
//       headers.set('Status-Text', cleanedStatusText)  // HTTP/2 requires Status-Text match the status, but this seems to work for now in Cloudflare TODO: Test this
//     }
//     if (body != null) {
//       headers.set('Content-Type', this.responseContentType)
//       if (typeof body === 'object') {
//         const newBody = structuredClone(body)  // TODO: C - Consider not cloning in production or preview
//         newBody.idString = this.idString
//         if (statusText != null) newBody.statusText = statusText
//         if (this.warnings.length > 0) newBody.warnings = this.warnings
//         return new Response(this.serialize(newBody), { status, headers })
//       }
//     }
//     return new Response(body, { status, headers })  // assumes body is already serialized or nullish
//   }

//   async serialize(o, contentType = this.responseContentType) {
//     try {
//       const { serialize } = this.constructor.contentProcessors[contentType]
//       return serialize(o)
//     } catch (e) {
//       throw new HTTPError(`Error serializing the supplied body: ${e.message}`, 500)
//     }
//   }

//   async deserialize(requestOrResponse = this.request) {
//     const contentType = requestOrResponse.headers.get('Content-Type')
//     throwIf(contentType == null, 'No Content-Type header supplied', 400)
//     try {
//       const { deserialize } = this.constructor.contentProcessors[contentType]
//       return deserialize(requestOrResponse)
//     } catch (e) {
//       throw new HTTPError(`Error serializing the supplied body: ${e.message}`, 500)
//     }
//   }
// }

// Register CBOR
const cborSC = new Encoder({ structuredClone: true })
async function serializeCBOR(o) {
  return cborSC.encode(o)
}
async function deserializeCBOR(requestOrResponse) {
  const ab = await requestOrResponse.arrayBuffer()
  if (ab.byteLength === 0) return null
  const u8a = new Uint8Array(ab)
  const result = decode(u8a)
  return result
}
const processorsCBOR = { serialize: serializeCBOR, deserialize: deserializeCBOR }
// BodyProcessor.registerContentProcessors(['application/cbor', 'application/cbor-sc'], processorsCBOR)  // since cbor is first, it is the default
registerContentProcessors(['application/cbor', 'application/cbor-sc'], processorsCBOR)  // since cbor is first, it is the default

// Register JSON
async function serializeJSON(o) {
  return JSON.stringify(o)
}
async function deserializeJSON(requestOrResponse) {
  return requestOrResponse.json()
}
const processorsJSON = { serialize: serializeJSON, deserialize: deserializeJSON }
// BodyProcessor.registerContentProcessors(['application/json'], processorsJSON)
registerContentProcessors(['application/json'], processorsJSON)

// TODO: Register text

// TODO: Register text/yaml, application/yaml

// TODO: Register form-data
