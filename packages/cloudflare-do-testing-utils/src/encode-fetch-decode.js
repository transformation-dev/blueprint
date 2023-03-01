/* eslint-disable no-param-reassign */
import { Encoder, decode } from 'cbor-x'

const cborSC = new Encoder({ structuredClone: true })

export async function encodeAndFetch(url, options, stub) {  // TODO: move this to a helper file
  if (!options) options = {}

  if (options.body) {
    const u8a = cborSC.encode(options.body)
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

  if (stub != null) return stub.fetch(url, options)
  return fetch(url, options)
}

export async function encodeFetchAndDecode(url, options, stub) {  // TODO: move this to a helper file
  const response = await encodeAndFetch(url, options, stub)
  const ab = await response.arrayBuffer()
  if (ab) {
    const u8a = new Uint8Array(ab)
    const o = decode(u8a)
    response.CBOR_SC = o
  }
  return response
}
