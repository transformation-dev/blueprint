import { Encoder } from 'cbor-x'

const cborSC = new Encoder({ structuredClone: true })

export default {
  getResponse(body, status = 200, statusText = undefined) {
    const headers = new Headers({ 'Content-Type': 'application/cbor-sc' })
    headers.set('Content-ID', this.idString)
    if (this.current?.meta?.eTag) headers.set('ETag', this.current.meta.eTag)  // for TemportalEntity
    if (this.entityMeta?.eTag) headers.set('ETag', this.entityMeta.eTag)  // for Tree
    if (statusText) headers.set('Status-Text', statusText)
    if (body && typeof body === 'object') {
      const newBody = structuredClone(body)
      newBody.idString = this.idString
      return new Response(cborSC.encode(newBody), { status, headers })
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
