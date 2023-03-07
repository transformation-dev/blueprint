/* eslint-disable no-param-reassign */
import { Encoder, decode } from 'cbor-x'

const cborSC = new Encoder({ structuredClone: true })

export async function encodeAndFetch(url, options, stub, state) {
  if (!options) options = {}

  if (options.body) {
    const u8a = cborSC.encode(options.body)  // TODO: Use FetchProcessor instead of directly encoding
    // const u8a = encode(options.body)  // using this seems to fail regardless of how I decode
    options.body = u8a
  }

  let headers
  if (options.headers) {
    headers = new Headers(options.headers)
  } else {
    headers = new Headers()
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/cbor-sc')
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/cbor-sc')
  }
  options.headers = headers

  const request = new Request(url, options)

  if (stub != null) {
    if (state != null) return globalThis.runWithMiniflareDurableObjectGates(state, () => stub.fetch(request))  // I hope this allows console.log's to finish before vitest exits
    return stub.fetch(request)
  }
  return fetch(request)
}

export async function encodeFetchAndDecode(url, options, stub, state) {  // TODO: use FetchProcessor instead of directly decoding
  const response = await encodeAndFetch(url, options, stub, state)
  const ab = await response.arrayBuffer()
  if (ab) {
    const u8a = new Uint8Array(ab)
    const o = decode(u8a)
    response.CBOR_SC = o
  }
  return response
}
