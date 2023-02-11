/* eslint-disable max-classes-per-file */

// 3rd party imports

// mono-repo imports
import { TransactionalDOWrapperBase, responseMixin } from '@transformation-dev/cloudflare-do-utils'

// local imports
import * as utils from './utils.js'

export * from './temporal-entity.js'

export * from './tree.js'

// Worker. I'm not sure why this is needed since we never call it. I'm guessing it's legacy
// Apparently, you can just do `export default {}`
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

export class Experimenter {
  async hydrate() {
    if (this.hydrated) return
    this.value = await this.state.storage.get('value')
    this.twiceValue = await this.state.storage.get('twiceValue')
    this.hydrated = true
  }

  constructor(state, env) {
    this.state = state
    this.env = env

    this.idString = this.state.id.toString()
    this.hydrated = false

    Object.assign(this, responseMixin)
  }

  async fetch(request) {
    switch (request.method) {
      case 'GET': {
        await this.hydrate()
        const value = await this.state.storage.get('value')
        const twiceValue = await this.state.storage.get('twiceValue')
        return this.getResponse({ value, twiceValue, valueInMemory: this.value, twiceValueInMemory: this.twiceValue })
      }
      case 'POST': {
        this.value = Math.random()
        this.state.storage.put('value', this.value)
        // if (Math.random() < 0.25) throw new Error('Random error thrown')
        if (Math.random() < 0.25) return this.getErrorResponse(new utils.HTTPError('Random error response'))
        await this.state.storage.put('twiceValue', this.value * 2)
        this.twiceValue = this.value * 2
        return this.getResponse({ value: this.value, twiceValue: this.twiceValue })
      }
      default:
        return new Response('Not found', { status: 404 })
    }
  }
}

export class Counter extends TransactionalDOWrapperBase {
  // Since we're using the same type and version concept and url ordering as TemporalEntity, we can defer those differences to TemporalEntity.
  // This means that TemporalEntity can be the class for many different types below but the url gets passed into TemporalEntity
  // so it would further refine the type inside of TemporalEntity. They will still have different schemas, validation, migrations, etc.
  static types = {
    experimenter: {
      versions: {
        v1: {
          environments: { preview: Experimenter, production: Experimenter, default: Experimenter },  // only "default" is required
        },
        v2: {
          environments: { preview: Experimenter, production: null },  // null means it's not available in production
        },
      },
    },
  }
}

export class PreviewCounter extends Counter {
  static production = false
}
