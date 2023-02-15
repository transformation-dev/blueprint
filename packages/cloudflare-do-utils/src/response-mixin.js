// TODO: Turn this into a class that you can inject with a Serialization instance and the default contentType

// local imports
import { serialize } from './serialization.js'

export const responseMixin = {
  getResponse(body, status = 200, statusText = undefined, contentType = 'application/cbor-sc') {
    const headers = new Headers()
    headers.set('Content-ID', this.idString)
    if (this.current?.meta?.eTag) headers.set('ETag', this.current.meta.eTag)  // for TemportalEntity
    if (this.treeMeta?.eTag) headers.set('ETag', this.treeMeta.eTag)  // for Tree
    if (statusText) {
      const cleanedStatusText = statusText.replaceAll('\n', ' ')
      headers.set('Status-Text', cleanedStatusText)
    }
    if (body != null) headers.set('Content-Type', contentType)
    if (ArrayBuffer.isView(body)) {
      return new Response(body, { status, headers })
    } else if (body != null && typeof body === 'object') {
      const newBody = structuredClone(body)
      newBody.idString = this.idString
      return new Response(serialize(newBody, contentType), { status, headers })
    }
    return new Response(undefined, { status, headers })
  },

  getErrorResponse(e) {
    if (!e.body) e.body = {}
    e.body.error = { message: e.message, status: e.status }
    if (this.env.CF_ENV !== 'production') e.body.error.stack = e.stack
    return this.getResponse(e.body, e.status ?? 500, e.message)
  },

  // eslint-disable-next-line class-methods-use-this
  getStatusOnlyResponse(status, statusText = undefined) {
    return this.getResponse(undefined, status, statusText)
  },
}
