/* eslint-disable max-classes-per-file */
import * as utils from './utils.js'
import responseMixin from './response-mixin.js'

export * from './temporal-entity.js'

export * from './tree.js'

// Worker. I'm not sure why this is needed since we never call it. I'm guessing it's legacy
export default {
  fetch() {
    return new Response('This Worker creates the Durable Object(s).')
  },
}

// Durable Object
export class TemporarilyDisabledCounter {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  static production = true

  // Handle HTTP requests from clients.
  async fetch(request) {
    const url = new URL(request.url)

    // Durable Object storage is automatically cached in-memory, so reading the
    // same key every request is fast. (That said, you could also store the
    // value in a class member if you prefer.)
    let value = await this.state.storage.get('value') || 0

    switch (url.pathname) {
      case '/increment':
        ++value
        break
      case '/decrement':
        --value
        break
      case '/':
        // Just serve the current value.
        break
      default:
        return new Response('Not found', { status: 404 })
    }

    // We don't have to worry about a concurrent request having modified the
    // value in storage because "input gates" will automatically protect against
    // unwanted concurrency. So, read-modify-write is safe. For more details,
    // see: https://blog.cloudflare.com/durable-objects-easy-fast-correct-choose-three/
    await this.state.storage.put('value', value)

    return new Response(value)
  }
}

export class Counter {
  constructor(state, env) {
    this.state = state
    this.env = env

    Object.assign(this, responseMixin)
  }

  async fetch(request) {
    const url = new URL(request.url)
    const pathArray = url.pathname.split('/')
    switch (request.method) {
      case 'GET': {
        const value1 = await this.state.storage.get('value1')
        const value2 = await this.state.storage.get('value2')
        return this.getResponse({ value1, value2 })
      }
      case 'POST': {
        const value = Math.random()
        if (pathArray.at(-2) === 'no-await') this.state.storage.put('value1', value)
        else await this.state.storage.put('value1', value)
        if (pathArray.at(-1) === 'throw') throw new Error('This is a test error')
        await this.state.storage.put('value2', value)
        return this.getResponse({ id: this.state.id.toString(), value })
      }
      default:
        return this.getResponse('Not found in Counter', { status: 404 })
    }
  }
}

export class PreviewCounter extends Counter {
  static production = false
}
