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
        if (Math.random() < 0.25) throw new Error('Random error thrown')
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

function sleep(ms) {
  // eslint-disable-next-line no-promise-executor-return
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class Counter {
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

  async hydrate() {
    if (this.hydrated) return
    this.transactionalWrapperMeta = await this.state.storage.get('transactionalWrapperMeta')
    this.hydrated = true
  }

  respondEarly(response, options) {  // TODO: Swap this out for my response mixin behavior
    this.gated = false
    return new Response(response, options)
  }

  constructor(state, env) {
    this.state = state
    this.env = env

    this.hydrated = false
    this.classInstance = null

    this.queue = []  // FIFO so push, shift, and peek with queue.at(-1)
    this.gated = false

    Object.assign(this, responseMixin)
  }

  async sleepUntilReady(request, delay = 3, retriesRemaining = 15) {
    console.log('sleepUntilReady %O', { delay, retriesRemaining })
    await sleep(delay)
    if (!this.gated) {
      if (!this.queue.includes(request)) return 'error'
      if (this.queue.at(-1) === request) {
        this.gated = true
        this.queue.shift()
        return 'continue'
      }
      if (retriesRemaining === 0) {
        this.queue = this.queue.filter((r) => r !== request)
        return 'timeout'
      }
    }
    const sleepResult = await this.sleepUntilReady(request, delay * 2, retriesRemaining - 1)
    return sleepResult
  }

  async fetch(request) {
    // I'm convinced that this input gate is not necessary in [some?/many?/all?] cases to protect against storage self-inconsistency.
    // However, I'm equally convinced that it is needed to protect against instance member in-memory self-inconsistency and even consistency
    // between in-memory and storage. This is because the built-in input gate only claims to kick in once there is a storage operation. What if
    // you change one instance member and the operation fails unexpectedly before you got a chance to change another instance member
    // that should remain consistent with the first one? The next call to the durable object will see this inconsistent state. It is
    // a very real possibility that's worth protecting against.
    //
    // Further, I don't believe this will measurably impact performance. Your parallism/scalability comes from using multiple durable object
    // instances. If you are relying upon a single durable object instance to handle a lot of concurrent requests, you are already bottlenecked.
    //
    // TODO: Improve this using async generators (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator)
    if (this.gated) {
      console.log('backpressure')
      const sleepResult = await this.sleepUntilReady(request)
      if (sleepResult === 'timeout') {
        return this.respondEarly('Request timed out', { status: 408 })
      } else if (sleepResult !== 'continue') {
        this.queue = []  // This will cause any other requests that were waiting to error next time they check
        return this.respondEarly('Unexpected sleep result', { status: 500 })
      }
    }
    this.gated = true
    await this.hydrate()
    const url = new URL(request.url)
    const pathArray = url.pathname.split('/')
    if (pathArray[0] === '') pathArray.shift()  // deal with leading slash
    const type = pathArray.shift()
    if (this.constructor.types[type] == null) {
      return this.respondEarly(`Type ${type} not found`, { status: 404 })
    }
    if (this.transactionalWrapperMeta != null && this.transactionalWrapperMeta.type !== type) {
      return this.respondEarly(`Type ${type} does not match previously stored ${this.transactionalWrapperMeta.type} for this durable object`, { status: 409 })
    }
    const version = pathArray.shift()
    if (this.constructor.types[type].versions[version] == null) {
      return this.respondEarly(`Version ${version} for type ${type} not found`, { status: 404 })
    }
    const environment = this.env.CF_ENV || 'default'
    const TheClass = this.constructor.types[type].versions[version].environments[environment]
    if (TheClass == null) {
      return this.respondEarly(`Environment ${environment} for version ${version} for type ${type} not found`, { status: 404 })
    }

    let response
    try {
      response = await this.state.storage.transaction(async (txn) => {
        const alteredState = { ...this.state, storage: txn }
        if (this.classInstance == null) this.classInstance = new TheClass(alteredState, this.env)
        else this.classInstance.state = alteredState  // Must reset this for each transaction. Means the DO must use this.state
        const responseInsideTransaction = await this.classInstance.fetch(request)
        if (responseInsideTransaction.status >= 400) {
          txn.rollback()  // explicit rollback whenever there is a non-2xx, non-3xx response
          this.classInstance = null  // reset the class instance so all memory will be rehydrated from storage on next request
        } else if (this.transactionalWrapperMeta == null) {
          const storageUsage = await txn.list({ limit: 1 })
          if (storageUsage.size > 0) {  // preserves DO behavior that a DO doesn't survive unless it has storage
            this.transactionalWrapperMeta = { type, version, environment }  // only type is checked for now but we'll store the others for migration purposes later
            await this.state.storage.put('transactionalWrapperMeta', this.transactionalWrapperMeta)
          } else {
            this.classInstance = null
          }
        }
        return responseInsideTransaction
      })
    } catch (e) {
      // rollback is automatic on error
      this.gated = false
      this.classInstance = null  // but we still need to reset the class instance so all memory will be rehydrated from storage on next request
      throw e  // rethrowing error to preserve the behavior of the wrapped durable object class
    }
    this.gated = false
    return response
  }
}

export class PreviewCounter extends Counter {
  static production = false
}
