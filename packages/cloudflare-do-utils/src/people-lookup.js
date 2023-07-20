// @ts-nocheck
// file deepcode ignore AttrAccessOnNull: Everytime I see this, I think it's a false positive

// monorepo imports
import { errorResponseOut, requestIn, responseOut } from './content-processor.js'
import { throwIf } from './throws.js'
import { getDebug, Debug } from './debug.js'
import { callDO, getTypeVersionConfigAndEnvironmentOptions } from './referenced-do-operations.js'

// initialize imports
const debug = getDebug('blueprint:people-lookup')

/*

## Key/metadata pairings

I'm using metadata rather than the value because the metadata comes back with the key when we do a list operation.
If you put it in the value, you have to do a get operation on each key to get the needed info. 1KB is supported in metatdata.

    1. key: `emailAddress/${emailAddress}`, metadata: { personIDString }
    2. key: `orgTree/${orgTreeIDString}`, metadata: { label }
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
        * Upserts all key/metadata pairs
        * Only allows if authenticated
        * Only allows if user has appropriate permissions
    TODO A0: * PATCH personIDStringToRemove, orgTreeIDString
    TODO A: * GET /email/{emailAddress}
        * Returns the { personIDString, name, orgTrees: { orgTreeIDString: { label } }
    TODO A: * GET /org-tree/{orgTreeIDString}
        * Returns { label, people: { personIDString: name } }
    TODO A: * GET /person/{personIDString}
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
  async patchAdd(content) {
    const { personValue, rootNodeValue, validFrom, impersonatorID } = content
    let { userID, personIDString, orgTreeIDString } = content

    // validation for person
    throwIf(personValue == null && personIDString == null, 'body.personValue or body.personIDString required', 400)
    throwIf(personValue != null && personIDString != null, 'Only one of body.personValue or body.personIDString allowed', 400)
    if (personValue != null) {
      throwIf(personValue.name == null, 'required personValue.name is missing', 400)
      throwIf(personValue.emailAddresses?.length < 1, 'personValue.emailAddresses must have at least one email address', 400)
    }

    // validation for org tree
    throwIf(rootNodeValue == null && orgTreeIDString == null, 'body.rootNodeValue or body.orgTreeIDString required', 400)
    throwIf(rootNodeValue != null && orgTreeIDString != null, 'Only one of body.rootNodeValue or body.orgTreeIDString allowed', 400)
    if (rootNodeValue != null) {
      throwIf(rootNodeValue.label == null, 'required rootNodeValue.label is missing', 400)
    }

    // TODO: Check that the user is authenticated
    // TODO: Confirm that userID or impersonatorID matches the cookie or maybe just use the cookie as a default if userID == null
    // TODO: Check that the user is already a member of the org tree if adding to an existing org tree
    // TODO: Only allow org tree creation if the user is a super-admin or (we are also adding a Person and userID === 'self')

    let personResponse
    if (personValue != null) {  // Create a new Person
      personValue.emailAddresses = personValue.emailAddresses.map((emailAddress) => emailAddress.toLowerCase())

      // Throw if any of the email addresses are already in use
      const promises = []
      for (const emailAddress of personValue.emailAddresses) {
        const promise = this.env.PEOPLE_LOOKUP.getWithMetadata(`emailAddress/${emailAddress}`)
        promises.push(promise)
      }
      const kvGetResponses = await Promise.all(promises)
      const inUseEmailAddresses = []
      for (const [index, { metadata }] of kvGetResponses.entries()) {
        if (metadata != null) {
          inUseEmailAddresses.push(personValue.emailAddresses[index])
        }
      }
      throwIf(inUseEmailAddresses.length > 0, `Email address(es) already in use: ${inUseEmailAddresses.join(', ')}`, 409)

      const options = {
        method: 'POST',
        body: { value: personValue, userID: userID ?? 'self', validFrom, impersonatorID },  // TODO: Use the cookie if userID == null
      }
      personResponse = await callDO(this.env, this.personTypeVersionConfig, options, 201)
      personIDString = personResponse.content.idString
      // eslint-disable-next-line no-const-assign
      if (userID === 'self' || userID == null) userID = personIDString
    } else {
      // const options = { additionalURLPath: 'ticks' }
      personResponse = await callDO(this.env, this.personTypeVersionConfig, undefined, 200, personIDString)
      userID = personResponse.content.meta.userID
    }
    const person = personResponse.content.value

    let orgTreeResponse
    if (rootNodeValue != null) {
      const options = {
        method: 'POST',
        body: { rootNodeValue, userID, validFrom, impersonatorID },
      }
      orgTreeResponse = await callDO(this.env, this.orgTreeTypeVersionConfig, options, undefined)
      if (orgTreeResponse.status !== 201) {  // TODO: Test this
        return [{ person: personResponse.content, orgTreeError: orgTreeResponse.content }, orgTreeResponse.status]
      }
      orgTreeIDString = orgTreeResponse.content.idString
    } else {
      // TODO: Create a new endpoint on OrgTree get that just returns the Tree data and maybe rootNode. Maybe add a depth limit?
      orgTreeResponse = await callDO(this.env, this.orgTreeTypeVersionConfig, undefined, 200, orgTreeIDString)
    }
    const { label } = orgTreeResponse.content.tree

    const promises = []
    let promise

    // 1. key: `emailAddress/${emailAddress}`, metadata: { personIDString }
    for (const emailAddress of person.emailAddresses) {
      promise = this.env.PEOPLE_LOOKUP.put(`emailAddress/${emailAddress}`, '', { metadata: { personIDString } })
      promises.push(promise)
    }

    // 2. key: `orgTree/${orgTreeIDString}`, metadata: { label }
    promise = this.env.PEOPLE_LOOKUP.put(`orgTree/${orgTreeIDString}`, '', { metadata: { label } })
    promises.push(promise)

    // 3. key: `orgTree/${orgTreeIDString}/${personIDString}`, metadata: { name }
    promise = this.env.PEOPLE_LOOKUP.put(`orgTree/${orgTreeIDString}/${personIDString}`, '', { metadata: { name: person.name } })
    promises.push(promise)

    // 4. key: `person/${personIDString}/${orgTreeIDString}`, metadata: { label }
    promise = this.env.PEOPLE_LOOKUP.put(`person/${personIDString}/${orgTreeIDString}`, '', { metadata: { label } })
    promises.push(promise)

    // 5. key: `person/${personIDString}`, metadata: { name }
    promise = this.env.PEOPLE_LOOKUP.put(`person/${personIDString}`, '', { metadata: { name: person.name } })
    promises.push(promise)

    try {
      await Promise.all(promises)
      return [{ person: personResponse.content, orgTree: orgTreeResponse.content }, 200]
    } catch (e) {
      // TODO: Do something reasonable if any KV operations fail
      return [{
        message: 'Error upserting people-lookup KV entries',
        person: personResponse.content,
        orgTree: orgTreeResponse.content,
        error: e,
      }, 500]
    }
  },

  async patchRemove(content) {
    const { personIDStringToRemove, orgTreeIDString } = content

    // validation
    throwIf(personIDStringToRemove == null, 'body.personIDStringToRemove required', 400)
    throwIf(orgTreeIDString == null, 'body.orgTreeIDString required', 400)

    // TODO: Check that the user is authenticated
    // TODO: Check that the user is a super-admin or root-admin (an admin of the root node of the org tree)

    // Delete the index entries in KV
    const promises = []
    let promise

    // 3. key: `orgTree/${orgTreeIDString}/${personIDString}`, metadata: { name }
    promise = this.env.PEOPLE_LOOKUP.delete(`orgTree/${orgTreeIDString}/${personIDStringToRemove}`)
    promises.push(promise)

    // 4. key: `person/${personIDString}/${orgTreeIDString}`, metadata: { label }
    promise = this.env.PEOPLE_LOOKUP.delete(`person/${personIDStringToRemove}/${orgTreeIDString}`)
    promises.push(promise)

    try {
      await Promise.all(promises)
      return [undefined, 202]
    } catch (e) {
      // TODO: Do something reasonable if any KV operations fail
      return [{
        message: 'Error deleting people-lookup KV entries',
        error: e,
      }, 500]
    }
  },

  async PATCH(request) {
    // throwIfMediaTypeHeaderInvalid(request)
    const { content } = await requestIn(request)
    // TODO: If impersonatorID is not null, then it must match the cookie
    // TODO: If impersonatorID is not null, then userID must be 'self' or a real userID
    // TODO: If impersonatorID is null, then userID must be 'self' or match the cookie. This will break existing tests
    let responseBody
    let status
    if (content?.personIDStringToRemove != null) [responseBody, status] = await this.patchRemove(content)
    else [responseBody, status] = await this.patchAdd(content)
    return responseOut(responseBody, status)
  },

  async get(options) {
    const { statusToReturn = 200 } = options ?? {}
    const result = null
    return [result, statusToReturn]
  },

  async GET() {
    const [responseBody, status] = await this.get()
    return responseOut(responseBody, status)
  },

  async fetch(request, env, context, personTypeVersionConfig, orgTreeTypeVersionConfig) {  // TODO: Use itty-router
    debug('fetch() called with %s %s', request.method, request.url)
    this.env = env
    this.context = context
    this.personTypeVersionConfig = personTypeVersionConfig
    this.orgTreeTypeVersionConfig = orgTreeTypeVersionConfig

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
      return errorResponseOut(e, this.env)  // this.env.CF_ENV determines whether to include the stack trace
    }
  },
}

export function getPersonLookupFetch(typeConfig, personType, personVersion, orgTreeType, orgTreeVersion) {
  const personTypeVersionConfig = getTypeVersionConfigAndEnvironmentOptions(personType, personVersion, typeConfig).typeVersionConfig
  const orgTreeTypeVersionConfig = getTypeVersionConfigAndEnvironmentOptions(orgTreeType, orgTreeVersion, typeConfig).typeVersionConfig
  return async (request, env, context) => handlers.fetch(request, env, context, personTypeVersionConfig, orgTreeTypeVersionConfig)
}

export function getPersonLookupFetchPartial(typeConfig, personType, personVersion, orgTreeType, orgTreeVersion) {
  const fetch = getPersonLookupFetch(typeConfig, personType, personVersion, orgTreeType, orgTreeVersion)
  return (env, context) => async (request) => fetch(request, env, context)
}
