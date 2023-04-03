// @ts-nocheck

// local imports
import { getDebug, Debug } from './debug.js'
import { errorResponseOut } from './content-processor.js'
import { HTTPError } from './http-error.js'

// initialize imports
const debug = getDebug('blueprint:transactional-do-wrapper')

export class VersioningTransactionalDOWrapperBase {
  async hydrate() {
    if (this.hydrated) return
    this.transactionalWrapperMeta = await this.state.storage.get('transactionalWrapperMeta')
    this.hydrated = true
  }

  constructor(state, env, { types, defaultTypeVersionConfig }) {  // Cloudflare only passes in 2 parameters, so either subclass and call super() or use in composition with a 3rd parameter
    Debug.enable(env.DEBUG)
    this.state = state
    this.env = env
    this.types = types
    this.defaultTypeVersionConfig = defaultTypeVersionConfig

    this.hydrated = false
    this.classInstance = null
  }

  async fetch(request) {
    debug('%s %s', request.method, request.url)
    // I'm relying upon the built-in input gating to prevent concurrent requests from starting before this one finishes.
    // However, it's unclear to me how exactly this works just reading the docs and posts about it. However, one thing
    // mentioned is that it kicks in once there is a storage operation, so we do a storage operation right away to rehydrate
    // this wrapper's state from disk. Note, this is different from the hydrate found() in TemplateEntity, which short-circuit
    // exits if the class instance is already hydrated. This version will always do a single get from storage.
    await this.hydrate()
    const url = new URL(request.url)
    const pathArray = url.pathname.split('/').filter((s) => s !== '')

    if (pathArray[0] === 'transactional-do-wrapper') {  // TODO: Test this
      if (request.method === 'DELETE') {
        await this.state.storage.deleteAll()
        return new Response(`All the data for DO ${this.state.id.toString()} has been deleted. The DO will eventually disappear unless there is a datacenter error.`, { status: 202 })  // TODO: Consider making this an object with a message field
      }
      return errorResponseOut(new HTTPError(`Unrecognized HTTP method ${request.method} for ${request.url}`, 405), this.env, this.state.id.toString())
      // throwIf(true, `Unrecognized HTTP method ${request.method} for ${request.url}`, 405)
    }

    // pull type/version from url and validate
    const type = pathArray.shift()
    if (this.types[type] == null) {
      return errorResponseOut(new HTTPError(`Type ${type} not found`, 404), this.env, this.state.id.toString())
    }
    if (this.transactionalWrapperMeta != null && this.transactionalWrapperMeta?.type !== type) {
      return errorResponseOut(new HTTPError(
        `Type ${type} does not match previously stored ${this.transactionalWrapperMeta?.type} for this durable object`,
        409,
      ), this.env, this.state.it.toString())
    }
    const version = pathArray.shift()
    if (this.types[type].versions[version] == null) {
      return errorResponseOut(new HTTPError(`Version ${version} for type ${type} not found`, 404), this.env, this.state.id.toString())
    }

    // set the typeVersionConfig by combining the default with the specific type/version
    const typeVersionConfig = {}
    const lookedUpTypeVersionConfig = this.types[type]?.versions[version] ?? {}
    const typeVersionConfigKeys = new Set([...Reflect.ownKeys(this.defaultTypeVersionConfig), ...Reflect.ownKeys(lookedUpTypeVersionConfig)])
    for (const key of typeVersionConfigKeys) {
      if (key !== 'environments') {
        typeVersionConfig[key] = lookedUpTypeVersionConfig[key] ?? this.defaultTypeVersionConfig[key]
      }
    }

    // set the environment options by combining the default with the options for the specific environment
    const environment = this.env.CF_ENV ?? '*'
    const environmentOptions = {}
    const defaultEnvironmentOptions = lookedUpTypeVersionConfig.environments['*'] ?? {}
    const lookedUpEnvironmentOptions = lookedUpTypeVersionConfig.environments[environment] ?? {}
    const keys = new Set([...Reflect.ownKeys(defaultEnvironmentOptions), ...Reflect.ownKeys(lookedUpEnvironmentOptions)])
    for (const key of keys) {
      environmentOptions[key] = lookedUpEnvironmentOptions[key] ?? defaultEnvironmentOptions[key]
    }

    if (environmentOptions.TheClass == null) {
      return errorResponseOut(new HTTPError(
        `TheClass for type/version/environment ${type}/${version}/${environment} or */*/* not found`,
        404,
      ), this.env, this.state.id.toString())
    }
    debug('Options for type "%s" version "%s": %O', type, version, environmentOptions)

    let requestToPassToWrappedDO
    if (typeVersionConfig.passFullUrl) {
      requestToPassToWrappedDO = request
      debug('Passing along full request. request.url: %s', request.url)
    } else {
      const joinedPath = pathArray.join('/')
      let urlToPassToWrappedDO = `http://fake.host/${joinedPath}`
      urlToPassToWrappedDO += request.url.slice(request.url.indexOf(joinedPath) + joinedPath.length)
      debug('URL to pass to wrapped DO: %s', urlToPassToWrappedDO)
      requestToPassToWrappedDO = new Request(urlToPassToWrappedDO, request)
    }

    let response

    try {
      if (typeVersionConfig.disableUseOfTransaction) {
        if (this.classInstance == null) this.classInstance = new environmentOptions.TheClass(this.state, this.env, typeVersionConfig)
        response = await this.classInstance.fetch(requestToPassToWrappedDO)
        return response
      } else {
        response = await this.state.storage.transaction(async (txn) => {
          const alteredState = { ...this.state, storage: txn }
          if (this.classInstance == null) this.classInstance = new environmentOptions.TheClass(alteredState, this.env, typeVersionConfig)
          else this.classInstance.state = alteredState  // Must reset this for each transaction. Means the DO must use this.state
          const responseInsideTransaction = await this.classInstance.fetch(requestToPassToWrappedDO)
          if (responseInsideTransaction.status >= 400) {
            txn.rollback()  // explicit rollback whenever there is a non-2xx, non-3xx response
            this.classInstance = null  // reset the class instance so all memory will be rehydrated from storage on next request
            debug('Rolling back transaction because response had status code: %s', responseInsideTransaction.status)
            return responseInsideTransaction
          }
          return responseInsideTransaction
        })
      }  // end if (options.flags.disableUseOfTransaction)
    } catch (e) {
      debug('Transaction was automatically rolled back because an error was thrown. Message: ', e.message)
      this.classInstance = null  // but we still need to reset the class instance so all memory will be rehydrated from storage on next request
      throw e  // Rethrowing to preserve the wrapped durable object's behavior. Ideally, the wrapped class returns a >=400 response instead of throwing an error.
    }

    // This next section checks to see if the DO is using any storage.
    // This preserves the Cloudflare behavior that a DO doesn't survive unless it has storage.
    // Without this check, our saving of the transactionalWrapperMeta would cause the DO to survive even if the wrapped DO didn't use storage.
    if (this.transactionalWrapperMeta == null) {
      const storageUsage = await this.state.storage.list({ limit: 1 })
      if (storageUsage.size > 0) {
        this.transactionalWrapperMeta = { type, version, environment }  // only type is checked for now but we'll store the others for migration purposes later
        await this.state.storage.put('transactionalWrapperMeta', this.transactionalWrapperMeta)
      } else {
        this.classInstance = null
      }
    }

    return response
  }
}
