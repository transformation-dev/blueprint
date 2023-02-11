/* eslint-disable max-classes-per-file */

// 3rd party imports

// local imports
import * as utils from './utils.js'
import responseMixin from './response-mixin.js'

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
    // if (this.hydrated) return
    // The above line is commented out because we want the storage operation in the line below to activate the input gate
    this.transactionalWrapperMeta = await this.state.storage.get('transactionalWrapperMeta')
    // this.hydrated = true
  }

  // eslint-disable-next-line class-methods-use-this
  respondEarly(response, options) {  // TODO: Swap this out for my response mixin behavior
    return new Response(response, options)
  }

  constructor(state, env) {
    this.state = state
    this.env = env

    // this.hydrated = false
    this.classInstance = null

    Object.assign(this, responseMixin)
  }

  async fetch(request) {
    // I'm relying upon the built-in input gating to prevent concurrent requests from starting before this one finishes.
    // However, it's unclear to me how exactly this works just reading the docs and posts about it. However, one thing
    // mentioned is that it kicks in once there is a storage operation, so we do a storage operation right away to rehydrate
    // this wrapper's state from disk. Note, this is different from the hydrate found() in TemplateEntity, which short-circuit
    // exits if the class instance is already hydrated. This version will always do a single get from storage.
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
          // This next section checks to see if the DO is using any storage.
          // This preserves the Cloudflare behavior that a DO doesn't survive unless it has storage.
          // Without this check, our saving of the transactionalWrapperMeta would cause the DO to survive even if it didn't use storage.
          const storageUsage = await txn.list({ limit: 1 })
          if (storageUsage.size > 0) {
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
      this.classInstance = null  // but we still need to reset the class instance so all memory will be rehydrated from storage on next request
      throw e  // Rethrowing to preserve the wrapped durable object's behavior. Ideally, the wrapped class returns a utils.getErrorResponse(e)
    }
    return response
  }
}

export class PreviewCounter extends Counter {
  static production = false
}
