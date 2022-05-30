import { deserialize } from '@ungap/structured-clone'

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
  const json = await response.json()
  if (json.type === 'HTTPError' && json.status >= 400 && json.message) {
    return new HTTPError(json.message, json.status)
  }
  if (mediaType === 'application/sc+json') {
    return deserialize(json)
  }
  return json
}
