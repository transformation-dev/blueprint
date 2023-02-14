// 3rd party imports
import { deserialize as deserializeUngapSC } from '@ungap/structured-clone'

// local imports
import { decodeCBORSC } from './cbor'

export async function extractBody(r, clone = false) {
  let rToWorkOn
  if (clone) rToWorkOn = r.clone()
  else rToWorkOn = r
  const contentType = rToWorkOn.headers.get('Content-Type')
  console.log('Content-Type:', contentType)
  if (contentType === 'application/cbor-sc') {
    return decodeCBORSC(rToWorkOn)
  } else if (contentType === 'application/json') {
    return rToWorkOn.json()
  } else if (contentType === 'application/vnd.ungap.structured-clone+json') {
    const json = await rToWorkOn.json()
    return deserializeUngapSC(json)
  } else {
    return rToWorkOn.text()
  }
}