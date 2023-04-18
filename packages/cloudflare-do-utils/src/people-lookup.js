// @ts-nocheck
// file deepcode ignore AttrAccessOnNull: Everytime I see this, I think it's a false positive

// monorepo imports
import { errorResponseOut, requestIn, responseOut } from './content-processor.js'
import { throwIf, throwUnless } from './throws.js'
import { getDebug, Debug } from './debug.js'
import referencedDOMixin from './referenced-do-mixin.js'

// initialize imports
const debug = getDebug('blueprint:people-lookup')

/*

## Key/metadata pairings

I'm using metadata rather than the value because the metadata comes back with the key when we do a list operation.
If you put it in the value, you have to do a get operation on each key to get the needed info. 1KB is supported in metatdata.

    1. key: `emailAddress/${emailAddress}`, metadata: { personIDString }
    2. key: `orgTree/${orgTreeIDString}`, metadata: { label, peopleCount }
    3. key: `orgTree/${orgTreeIDString}/${personIDString}`, metadata: { name }
       There will eventually be thousands of these. The idea is that adding a new one only adds one key and updates no others.
       To retrieve them we’ll use the list API function using a prefix option `orgTree/${orgTreeIDString}/`.
       I think we can just get them all for a given orgTreeIDString with no paging because 128MB should hold 100’s of thousands.
       The value is the name to save the lookup using key/metadata pair #4. This means we'll need to update both key/metadata pair #3 and #4 when the name changes.
    4. key: `person/${personIDString}/${orgTreeIDString}`, metadata: { label }
    5. key: `person/${personIDString}`, metadata: { name }

## Endpoints
    * PATCH personValue or personIDString, rootNodeValue or orgTreeIDString
        * Creates the Person DO and/or Org Tree DO if necessary. After that we'll have an personIDString and orgTreeIDString.
        * Error if the email is in use
        * Upserts key/metadata all key/metadata pairs
    * GET /email/{emailAddress}
        * Returns the { personIDString, name, orgTrees: { orgTreeIDString: { label } }
    * GET /org-tree/{orgTreeIDString}
        * Returns { label, people: { personIDString: name } }
    * GET /person/{personIDString}
        * Returns { name, orgTreeorgTrees: { orgTreeIDString: { label } }

## Queue consumers
    * updateFromPerson - body { person: everything returned by a GET }
        * update key/metadata pair #1: Calculate delta of emailAddresses array in the Person object
            * Set(Current) - Set(Previous) ==> Add these
            * Set(Previous) - Set(Current) ==> Remove these
        * update the name in metadata #5
            * Use personIDString to lookup and update metadata
        * update the name in metadata #3 for each orgTreeIDString
        * handle delete and undelete
    * updateFromOrgTree - body { orgTree: everything returned by GET }
        * update the label in key/metadata pairs #2 and #4
*/

const handlers = {

  env: null,
  context: null,

  // Section: Handlers

  async patch(content) {
    const { personValue, rootNodeValue, userID, validFrom, impersonatorID } = content
    let { personIDString, orgTreeIDString } = content
    throwIf(personValue == null && personIDString == null, 'body.personValue or body.personIDString required', 400)
    throwIf(rootNodeValue == null && orgTreeIDString == null, 'body.rootNodeValue or body.orgTreeIDString required', 400)

    // await this.hydrate()

    let name
    if (personValue != null) {  // Create a new Person
      const options = {
        method: 'POST',
        body: { value: personValue, userID: userID ?? 'self', validFrom, impersonatorID },  // TODO: Upgrade to allow use of 'self' for UserID
      }
      // TODO: wrap this in a try/catch block and retry if the optimistic concurrency check fails
      // This next line is going to open the input gate. We may need our own gate?
      const response = await referencedDOMixin.callDO(this.typeVersionConfig.personType, this.typeVersionConfig.personVersion, options, 201)
      personIDString = response.content.idString
      name = response.content.value.name
    }

    return this.get({ statusToReturn: 200 })
  },

  async PATCH(request) {
  // throwIfMediaTypeHeaderInvalid(request)
    const { content } = await requestIn(request)
    const [responseBody, status] = await this.patch(content)  // For now, PATCH is the same as POST
    return this.listResponseOut(responseBody, status)
  },

  async get(options) {
    const { statusToReturn = 200 } = options ?? {}
    await this.hydrate()
    const result = { elements: this.elements }
    return [result, statusToReturn]
  },

  async GET() {
    const [responseBody, status] = await this.get()
    return this.listResponseOut(responseBody, status)
  },

  testNormal() {
    console.log('testNormal this: %O: ', this)
  },

  async fetch(request, env, context) {  // TODO: Use itty-router
    debug('fetch() called with %s %s', request.method, request.url)
    this.env = env
    this.context = context

    this.testNormal()

    console.log('request.method: %O', request.method)

    this.warnings = []
    try {
      const url = new URL(request.url)
      const pathArray = url.pathname.split('/').filter((s) => s !== '')

      const restOfPath = `/${pathArray.join('/')}`
      switch (restOfPath) {
        case '/':
          if (handlers[request.method] != null) return await handlers[request.method](request)
          return throwIf(true, `Unrecognized HTTP method ${request.method} for ${url.pathname}`, 405)

        default:
          return throwIf(true, `Unrecognized URL ${url.pathname}`, 404)
      }
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate  TODO: Don't always do this
      return errorResponseOut(e, this.env)  // TODO: What is this.env used for here?
    }
  },
}

Object.assign(handlers, referencedDOMixin)

export default {
  fetch: handlers.fetch.bind(handlers),
}

export function getFetchPartial(env, context) {
  return async (request) => handlers.fetch(request, env, context)
}
