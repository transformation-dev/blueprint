// 3rd party imports
import { decode } from 'cbor-x'

// local imports
import { HTTPError } from './http-error.js'

async function deserializeCBOR(request) {  // TODO: Take a contentType argument
  try {
    const ab = await request.arrayBuffer()
    const u8a = new Uint8Array(ab)
    const o = decode(u8a)
    return o
  } catch (e) {
    throw new HTTPError('Error decoding your supplied body. Encode with npm package cbor-x using structured clone extension.', 415)
  }
}

export async function extractBody(r, clone = false) {
  let rToWorkOn
  if (clone) rToWorkOn = r.clone()
  else rToWorkOn = r
  const contentType = rToWorkOn.headers.get('Content-Type')
  if (contentType === 'application/cbor-sc') {
    return deserializeCBOR(rToWorkOn)
  } else if (contentType === 'application/json') {
    return rToWorkOn.json()
  } else {
    return rToWorkOn.text()
  }
}
