/* eslint-disable max-classes-per-file */

// 3rd party imports

// local imports
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

class Experimenter {
  static versions = ['v1']

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
        if (pathArray.at(-1) === 'error-status') return new Response('This is a test error', { status: 400 })
        await this.state.storage.put('value2', value)
        return this.getResponse({ id: this.state.id.toString(), value })
      }
      default:
        return new Response('Not found', { status: 404 })
    }
  }
}

export class Counter {
  // Since we're using the same type and version concept and url ordering as TemporalEntity, we can defer those differences to TemporalEntity.
  // This means that TemporalEntity can be the class for many different types but they will still have different schemas, validation, migrations, etc.
  // The url gets passed into TemporalEntity so it would further refine the type inside of TemporalEntity.
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

  async hydrate() {
    if (this.hydrated) return
    this.transactionalWrapperMeta = await this.state.storage.get('transactionalWrapperMeta') || {}
    this.hydrated = true
  }

  constructor(state, env) {
    this.state = state
    this.env = env

    this.hydrated = false
    this.classInstance = null

    Object.assign(this, responseMixin)
  }

  async fetch(request) {
    await this.hydrate()
    const url = new URL(request.url)
    const pathArray = url.pathname.split('/')
    if (pathArray[0] === '') pathArray.shift()  // deal with leading slash
    const type = pathArray.shift()
    if (this.transactionalWrapperMeta.type == null) {
      if (this.constructor.types[type] != null) {
        this.transactionalWrapperMeta.type = type
        await this.state.storage.put('transactionalWrapperMeta', this.transactionalWrapperMeta)
      } else {
        return new Response(`Type ${type} not found`, { status: 404 })
      }
    } else if (this.transactionalWrapperMeta.type !== type) {
      return new Response(`Type ${type} does not match previously stored ${this.transactionalWrapperMeta.type} for this durable object`, { status: 404 })
    }
    const version = pathArray.shift()
    if (this.constructor.types[type].versions[version] == null) {
      return new Response(`Version ${version} for type ${type} not found`, { status: 404 })
    }
    const environment = this.env.CF_ENV || 'default'
    const TheClass = this.constructor.types[type].versions[version].environments[environment]
    if (TheClass == null) {
      return new Response(`Environment ${environment} for version ${version} for type ${type} not found`, { status: 404 })
    }

    let response
    try {
      response = await this.state.storage.transaction(async (txn) => {
        const alteredState = { ...this.state, storage: txn }
        if (this.classInstance == null) this.classInstance = new TheClass(alteredState, this.env)
        else this.classInstance.state = alteredState
        const responseInsideTransaction = await this.classInstance.fetch(request)
        if (responseInsideTransaction.status >= 400) {
          txn.rollback()  // explicit rollback whenever there is a non-2xx, non-3xx response
          this.classInstance = null  // reset the class instance so all memory will be rehydrated from storage on next request
        }
        return responseInsideTransaction
      })
    } catch (e) {
      // rollback is automatic on error
      this.classInstance = null  // but we still need to reset the class instance so all memory will be rehydrated from storage on next request
      throw e
    }

    return response
  }
}

export class PreviewCounter extends Counter {
  static production = false
}
