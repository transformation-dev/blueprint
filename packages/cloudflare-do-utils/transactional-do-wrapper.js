import * as responseMixin from './response-mixin.js'

export class TransactionalDOWrapperBase {
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
