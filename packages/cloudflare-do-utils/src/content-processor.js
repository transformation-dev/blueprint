// 3rd party imports
import { Encoder, decode } from 'cbor-x'

// local imports
import { throwIf } from './throws.js'

export const DEFAULT_CONTENT_TYPE = 'application/cbor'
export const contentProcessors = {}

function getProcessors(contentType) {
  let processors = contentProcessors[contentType]
  if (processors != null) return processors
  let processorsKey
  for ([processorsKey, processors] of Object.entries(contentProcessors)) {
    if (contentType.startsWith(processorsKey)) return processors
  }
  throwIf(true, `Unknown Content-Type header: ${contentType}`, 400)  // using true because null checks occur above
  return processors  // technically this is unreachable but eslint can't tell that
}

// itty-router middleware which cannot have a return.
export async function withAdvancedContent(request) {
  const contentType = request.headers.get('Content-Type')
  const { deserialize } = getProcessors(contentType)
  request.content = await deserialize(request)
}

// Same as above except it returns the request to match the signature of the remainder of these functions.
export async function requestIn(request) {
  const contentType = request.headers.get('Content-Type')
  if (contentType == null) {
    if (request.body == null) {
      return request
    } else {
      throwIf(true, 'No Content-Type header supplied', 400)
    }
  }
  await withAdvancedContent(request)
  return request
}

export async function requestOut(input, inputOptions) {
  if (input instanceof Request) return input  // TODO: Don't do this. Rather update the Request with the same headers as below. If Content-Type is not set and it's not a ArrayBuffer.isView() then serialize
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

  if (options.body != null) {
    let contentType
    if (headers.has('Content-Type')) {
      contentType = headers.get('Content-Type')
    } else {
      contentType = DEFAULT_CONTENT_TYPE
      headers.set('Content-Type', contentType)
    }
    const { serialize } = getProcessors(contentType)
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
      const { serialize } = getProcessors(contentType)
      return new Response(await serialize(body), { status, headers })
    }
  }
  return new Response(undefined, { status, headers })
}

export function errorResponseOut(e, env, idString) {
  const body = e.body ?? {}
  body.error = { message: e.message, status: e.status ?? 500 }
  if (env?.CF_ENV !== 'production') {
    body.error.stack = e.body?.error?.stack ?? ''
    body.error.stack += e.stack
  }
  body.idString = idString
  return responseOut(body, e.status ?? 500)
}

export async function responseIn(response) {
  const contentType = response.headers.get('Content-Type')
  if (contentType == null) {
    if (response.body == null || [304, 204].includes(response.status)) {
      return response
    } else {
      throwIf(true, 'No Content-Type header supplied', 400)
    }
  }
  const { deserialize } = getProcessors(contentType)
  response.content = await deserialize(response)
  return response
}

export function errorResponseIn(e, env, idString) {
  const body = e.body ?? {}
  body.error = { message: e.message, status: e.status ?? 500 }
  if (env?.CF_ENV !== 'production') {
    body.error.stack = e.body?.error?.stack ?? ''
    body.error.stack += e.stack
  }
  body.idString = idString
  const response = {  // Note, this is not a real Response object. It just has status and content
    status: e.status ?? 500,
    content: body,
  }
  return response
}

export async function requestOutResponseIn(url, options, stub, state) {
  const request = await requestOut(url, options)
  let response

  try {
    if (stub != null) {
      if (state != null && globalThis.runWithMiniflareDurableObjectGates != null) {  // Means we must be running tests in miniflare
        response = await globalThis.runWithMiniflareDurableObjectGates(state, () => stub.fetch(request))  // I hope this allows console.log's to finish before vitest exits
      } else {
        response = await stub.fetch(request)
      }
    } else {
      response = await fetch(request)
    }
  } catch (e) {
    return errorResponseIn(e, this.env, state?.id.toString())
  }
  return responseIn(response)
}

function registerContentProcessors(contentTypeArray, processors) {  // processors = { serialize, deserialize }
  for (const contentType of contentTypeArray) {
    contentProcessors[contentType] = processors
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
  const result = decode(u8a)
  return result
}
const processorsCBOR = { serialize: serializeCBOR, deserialize: deserializeCBOR }
registerContentProcessors(['application/cbor', 'application/cbor-sc'], processorsCBOR)

// Register JSON
async function serializeJSON(o) {
  return JSON.stringify(o)
}
async function deserializeJSON(requestOrResponse) {
  return requestOrResponse.json()
}
const processorsJSON = { serialize: serializeJSON, deserialize: deserializeJSON }
registerContentProcessors(['application/json'], processorsJSON)

async function serializeText(o) {
  if (typeof o === 'string' || o instanceof String) return o
  return JSON.stringify(o)
}
async function deserializeText(requestOrResponse) {
  return requestOrResponse.text()
}
const processorsText = { serialize: serializeText, deserialize: deserializeText }
registerContentProcessors(['text/'], processorsText)

// TODO: Register application/yaml. application/yaml should return an object. text/yaml should use the 'text/' processors above and return the string.

// TODO: Register form-data
