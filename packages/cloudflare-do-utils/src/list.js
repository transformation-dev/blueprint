// @ts-nocheck
/* eslint-disable no-param-reassign */  // safe because durable objects are airgapped so to speak
// file deepcode ignore AttrAccessOnNull: Everytime I see this, I think it's a false positive

// monorepo imports
import { errorResponseOut, requestIn, responseOut } from './content-processor.js'
import { throwIf, throwUnless } from './throws.js'
import { getDebug, Debug } from './debug.js'
import referencedDOMixin from './referenced-do-mixin.js'

// initialize imports
const debug = getDebug('blueprint:list')

/*

/list/v1
  TODO A0: POST body.value - creates a new List

/list/v1/[listIDString]
  TODO A: PATCH body.value - adds an Element to the List
  TODO A: GET - returns the entire List with ElementStubs (label and deleted for all List types. emails for Persons List)

/list/v1/[listIDString]/query
  TODO A: POST body.query - queries using sift // Doing this instead of GET to avoid complexity of converting URL query params to sift JS literal
  Returns a subset of the List that matches the query
  Use sift against the cached fields

TODO: Use Cloudflare queues to communicate changes to Element TemporalEntities to the List instance
*/

/**
 * # List
 *
 * @constructor
 * @param {DurableObjectState} state
 * @param {DurableObjectEnv} env
 *
 * */
export class List  {
  // <ElementStub> = {
  //   idString: string,
  //   label: string,  // denormalized from the Element itself
  //   <other fields>: <other values>  // denormalized from the Element itself
  // }
  // <Elements> = [<ElementStub>]  // unlike Tree which has its own counter, this just uses the idString for the Element DO

  constructor(state, env, typeVersionConfig) {
    Debug.enable(env.DEBUG)
    this.state = state
    this.env = env
    this.typeVersionConfig = typeVersionConfig

    Object.assign(this, referencedDOMixin)

    this.idString = this.state.id.toString()
    this.hydrated = false  // using this.hydrated for lazy load rather than this.state.blockConcurrencyWhile(this.hydrate.bind(this))
  }

  // Section: Utilities

  async hydrate() {
    debug('hydrate() called. this.hydrated: %O', this.hydrated)
    if (this.hydrated) return

    // hydrate instance data
    this.elements = await this.state.storage.get(`${this.idString}/elements`) ?? []
    this.hydrated = true
  }

  // TODO: Upgrade this to support a large number of elements.
  //       Actually, I think the best thing to do is to handel it like we handel PeopleLookup by storing each element
  //       in a separate key/value storage slot and using storage.list() to pull them all in at once for GET.
  save() {
    debug('save() called')
    this.state.storage.put(`${this.idString}/elements`, this.elements)
  }

  async listResponseOut(body, status = 200) {
    const headers = new Headers()
    headers.set('Content-ID', this.idString)
    if (body != null) {
      body.idString = this.state?.id.toString()
      body.meta = { type: this.typeVersionConfig.type, version: this.typeVersionConfig.version }
      if (this.warnings != null) body.warnings = this.warnings
    }
    return responseOut(body, status, undefined, headers)
  }

  // Section: fetch

  async fetch(request) {
    debug('fetch() called with %s %s', request.method, request.url)
    this.warnings = []
    try {
      const url = new URL(request.url)
      const pathArray = url.pathname.split('/').filter((s) => s !== '')

      const restOfPath = `/${pathArray.join('/')}`
      switch (restOfPath) {
        case '/':
          if (this[request.method] != null) return await this[request.method](request)
          return throwIf(true, `Unrecognized HTTP method ${request.method} for ${url.pathname}`, 405)

        default:
          return throwIf(true, `Unrecognized URL ${url.pathname}`, 404)
      }
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate  TODO: Don't always do this
      return errorResponseOut(e, this.env, this.idString)
    }
  }

  // Section: Handlers

  async postValue({ value, userID, validFrom, impersonatorID }) {
    await this.hydrate()

    const statusToReturn = this.elements.length === 0 ? 201 : 200

    value.listIDString = this.idString
    const options = {
      method: 'POST',
      body: { value, userID, validFrom, impersonatorID },
    }

    // TODO: wrap this in a try/catch block and retry if the optimistic concurrency check fails
    // This next line is going to open the input gate. We may need our own gate?
    const response = await this.callDO(this.typeVersionConfig.elementType, this.typeVersionConfig.elementVersion, options, 201)

    const elementIDString = response.content.idString
    const v = response.content.value
    const stub = { elementIDString }
    for (const field of this.typeVersionConfig.stubFields) {
      stub[field] = v[field]
    }
    this.elements.push(stub)

    this.save()

    return this.get({ statusToReturn })
  }

  async post(options) {
    throwUnless(options.userID, 'userID required by List POST is missing')

    if (options.value != null) return this.postValue(options)

    return throwIf(
      true,
      'Malformed POST on List. Body must include valid operation: value, etc.',
      400,
    )
  }

  async POST(request) {
    // throwIfMediaTypeHeaderInvalid(request)
    const { content: options } = await requestIn(request)
    const [responseBody, status] = await this.post(options)
    return this.listResponseOut(responseBody, status)
  }

  async PATCH(request) {
    // throwIfMediaTypeHeaderInvalid(request)
    const { content: options } = await requestIn(request)
    const [responseBody, status] = await this.post(options)  // For now, PATCH is the same as POST
    return this.listResponseOut(responseBody, status)
  }

  async get(options) {
    const { statusToReturn = 200 } = options ?? {}
    await this.hydrate()
    const result = { elements: this.elements }
    return [result, statusToReturn]
  }

  async GET() {
    const [responseBody, status] = await this.get()
    return this.listResponseOut(responseBody, status)
  }
}
