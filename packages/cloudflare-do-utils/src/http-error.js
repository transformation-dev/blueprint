export class HTTPError extends Error {
  constructor(message, status, body) {
    super(message)
    this.status = status
    if (body != null) {
      if (typeof body === 'object') {
        this.body = structuredClone(body)  // TODO: C - Consider not cloning in production or preview
        this.body.error = { message, status }
      } else {
        this.body = body
      }
    } else {
      this.body = { error: { message, status } }
    }
  }
}
