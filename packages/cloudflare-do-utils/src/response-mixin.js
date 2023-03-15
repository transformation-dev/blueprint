// TODO: Turn this into a class that you can inject with a Serialization instance and the default contentType

// local imports
import { serialize } from './serialization.js'

export const responseMixin = {
  getResponse(body, status = 200, statusText = undefined, contentType = 'application/cbor-sc') {
    const headers = new Headers()
    headers.set('Content-ID', this.idString)
    if (statusText) {
      const cleanedStatusText = statusText.replaceAll('\n', ' ')
      headers.set('Status-Text', cleanedStatusText)
    }
    if (body != null) headers.set('Content-Type', contentType)
    if (ArrayBuffer.isView(body)) {  // Assumes it's already been serialized regardless of contentType
      return new Response(body, { status, headers })
    } else if (body != null && typeof body === 'object') {
      const newBody = structuredClone(body)
      newBody.idString = this.idString
      newBody.warnings = this.warnings ?? []
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

  warnIf(condition, message) {
    if (condition) {
      this.debug('WARNING: %s', message)  // TODO: Attach debug to this in TemporalEntityBase
      if (this.warnings == null) this.warnings = []
      this.warnings.push(message)
      // TODO: Add warnings to response
    }
  },

  warnUnless(condition, message) {
    this.warnIf(!condition, message)
  },
}
