import { Encoder } from 'cbor-x'

const cborSC = new Encoder({ structuredClone: true })

export class HTTPError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }

  toJSON() {
    return { type: 'HTTPError', message: this.message, status: this.status }
  }
}

export const parseBody = async (response) => {
  const mediaType = response.headers.get('Content-Type')
  if (mediaType === 'application/cbor-sc') {
    const ab = await response.arrayBuffer()
    const u8a = new Uint8Array(ab)
    return cborSC.decode(u8a)
  }
  const json = await response.json()
  if (json.type === 'HTTPError' && json.status >= 400 && json.message) {
    return new HTTPError(json.message, json.status)
  }
  return json
}
