/* eslint-disable quote-props */
/* eslint-disable no-param-reassign */
/* eslint-disable object-curly-newline */
/* eslint-disable no-restricted-syntax */

import { diff } from 'deep-object-diff'
import { Encoder } from 'cbor-x'
import { nanoid as nanoidNonSecure } from 'nanoid/non-secure'  // should be fine to use the non-secure version since we are only using this for eTags
// import { nanoid } from 'nanoid'

import * as utils from './utils.js'

const cborSC = new Encoder({ structuredClone: true })

// The DurableObject storage API has no way to list just the keys so we have to keep track of all the
// validFrom dates manually and store them under a key entityMeta.timeline
// For now, timeline is just be an array of ISO date strings, but later it could be a range-query b-tree
// if that will help performance.

// To make the code unit testable, I separate the upper-case PUT, GET, etc. from the lower-case put, get, etc.
// The lower-case functions have all the tricky business logic that I test with unit tests.
// The upper-case functions are wrappers and deal with Request and Response objects.
// Lower-case functions will throw errors that are caught by the upper-case functions and turned into
// HTTP responses in a consistent way with a single `getErrorReponse()` function.

// TODO: Don't forget to always soft delete to support ETL from last update. Don't forget to include ETag header in response

// TODO: Implement query using npm module sift. Include an option to include soft-deleted items in the query. Update the error message for GET
//       https://github.com/crcn/sift.js

// TODO: Implement query against all snapshots using npm module sift

// TODO: Create a schema registry and passing in schemas which will use semantic versioning (e.g. OrgNode@1.7.12)
//       put() and patch() to allow for the specification of schemas { value/delta, schemas, userID, etc. } in the body

// TODO: Get Debug() working

// TODO: Implement ticks

function getResponse(body, eTag, status = 200, statusText = undefined) {
  const headers = new Headers({ 'Content-Type': 'application/cbor-sc' })
  if (eTag) {
    headers.set('ETag', eTag)
  } else if (body?.meta?.eTag) {
    headers.set('ETag', body.meta.eTag)
  }
  if (statusText) {
    headers.set('Status-Text', statusText)
  }
  return new Response(cborSC.encode(body), { status, headers })
}

function getErrorResponse(e) {
  if (!e.body) e.body = {}
  e.body.error = { message: e.message, status: e.status }
  return getResponse(e.body, undefined, e.status || 500, e.message)
}

function getStatusOnlyResponse(status) {
  return new Response(undefined, { status })
}

function apply(obj, d) {
  for (const key of Object.keys(d)) {
    if (d[key] instanceof Object) {
      // eslint-disable-next-line no-param-reassign
      obj[key] = apply(obj[key] || {}, d[key])
    } else if (d[key] === undefined) {
      // eslint-disable-next-line no-param-reassign
      delete obj[key]
    } else {
      // eslint-disable-next-line no-param-reassign
      obj[key] = d[key]
    }
  }
  return obj
}

function extractETag(request) {
  let eTag = request.headers.get('If-Match')
  if (!eTag) eTag = request.headers.get('If-None-Match')
  if (eTag === 'undefined' || eTag === 'null') return undefined
  return eTag
}

/**
 * # TemporalEntity
 *
 * TemporalEntity retains its history in a timeline of snapshots. Each snapshot is a copy of the entity's value.
 * validFrom and validTo define the time range for which the snapshot is valid. This approach was invented by
 * Richard Snodgrass (see https://en.wikipedia.org/wiki/Valid_time). The validTo for the current
 * snapshot is set to a date ~8000 years in the future, 9999-01-01T00:00:00.000Z. This makes queries for a particular
 * moment in time or a range include the current snapshot.
 *
 * ## Debouncing
 *
 * If the same user makes multiple updates to the same entity within the time period specified by the granularity
 * (default: 1 hour), the updates are merged into a single snapshot. This prevents the history from growing too
 * rapidly in the now common pattern of saving changes as they are made rather than waiting until the user clicks on
 * a save button.
 *
 * ## CBOR with structured clone extension encoding
 *
 * The entity value is encoded as CBOR with the structured clone extension using the npm package cbor-x. CBOR is the
 * IEC standardized form of MessagePack. I have chosen 'application/cbor-sc' as the media type rather than 'application/cbor'
 * because it seems to error unless the structured clone extension is specified. I use cbor-sc encoding for the following reasons:
 *   1. With the structured clone extension, it allows you to encode JavaScript objects with directed acyclic graphs (DAGs)
 *      and circular references. The org tree for Transformation.dev Blueprint is a DAG and I needed a way to send
 *      that over the wire so I had to use something like this for at least the transmission of the org tree. I chose
 *      to use it for all transmission for the remainder of these reasons.
 *   2. It supports essentially all JavaScript types including Dates, Maps, Sets, etc.
 *   3. It's an official standard unlike MessagePack, which is just a defacto standard, although switching to MessagePack
 *      would be trivial since cbor-x package is derived from the msgpackr package by the same author which is likewise
 *      the fastest MessagePack encoder/decoder.
 *   4. It's faster (at least with cbor-x) for encoding and decoding than native JSON.
 *   5. Since it's a binary format, it's more compact than JSON which makes transmission faster and cheaper.
 *      Also, if you have an array with rows in the same object format, it can be an order of magnitude more compact than JSON.
 *
 * ## Deviations from pure REST APIs
 *
 * The default behavior of TemporalEntity might deviate from your expectations for a pure REST API in these ways:
 *   1. PUT behaves like an UPSERT. If there is no prior value, it will create the entity.
 *   2. As such, there is no need for a POST method. A PUT without a prior ID will behave like you would expect a POST to behave
 *   3. Response.statusText is hard-coded to the HTTP status code message. I believe this is a new requirement with HTTP/2. So,
 *      we return details about the nature of the error in two other ways:
 *      a. using a custom header, Status-Text, which is a human readable message. I'm unaware if this breaks any HTTP rules and
 *         would be willing to revert this if someone can point me to a reference that says it's a bad idea.
 *      b. using the body.error.message field encoded with cbor-sc. This is the same human readable message as the Status-Text header.
 *
 * ## Optimistic Concurrency
 *
 * TemporalEntity uses optimistic concurrancy using ETags, If-Match, and If-None-Match headers
 * (see: https://en.wikipedia.org/wiki/HTTP_ETag). The ETag header is sent back for all requests and it will always match the
 * body.meta.eTag so feel free to that latter that if it's more convenient. Note, the ETag is not a hash of the value but rather
 * it is a globally unique random value generated using nanoid (non-secure). I did this because it accomplishes the same goal and
 * I believe that generating a hash of the value would cost more CPU cycles.
 *
 * @constructor
 * @param {DurableObjectState} state
 * @param {DurableObjectEnv} env
 *
 * */
export class TemporalEntity {
  static #END_OF_TIME = '9999-01-01T00:00:00.000Z'

  static get END_OF_TIME() {
    return TemporalEntity.#END_OF_TIME
  }

  #entityMeta  // Metadata for the entity { timeline, eTags }

  #current  // { value, meta }

  #hydrated

  constructor(state, env) {
    this.state = state
    this.env = env
    this.#hydrated = false
    // using this.#hydrated for lazy load rather than this.state.blockConcurrencyWhile(this.#hydrate.bind(this))
  }

  async #hydrate() {
    if (this.#hydrated) return
    this.#entityMeta = await this.state.storage.get('entityMeta')
    this.#entityMeta ??= { timeline: [], eTags: [] }
    if (this.#entityMeta.timeline.length > 0) {
      this.#current = await this.state.storage.get(`snapshot-${this.#entityMeta.timeline.at(-1)}`)
    }
    this.#hydrated = true
  }

  #setValidFrom(validFrom) {
    let validFromDate
    if (validFrom) {
      if (this.#entityMeta?.timeline?.length > 0) {
        utils.throwIf(validFrom <= this.#entityMeta.timeline.at(-1), 'the validFrom for a TemporalEntity update is not greater than the prior validFrom')
      }
      validFromDate = new Date(validFrom)
    } else {
      validFromDate = new Date()
      if (this.#entityMeta?.timeline?.length > 0) {
        const lastTimelineDate = new Date(this.#entityMeta.timeline.at(-1))
        if (validFromDate <= lastTimelineDate) {
          validFromDate = new Date(lastTimelineDate.getTime() + 1)
        }
        validFrom = new Date(validFromDate).toISOString()
      } else {
        validFrom = validFromDate.toISOString()
        validFromDate = new Date(validFrom)
      }
    }
    return { validFrom, validFromDate }
  }

  // The body and return is always a CBOR-SC object
  async fetch(request) {
    const url = new URL(request.url)

    switch (url.pathname) {
      case '/':
        if (['PUT', 'PATCH', 'GET', 'DELETE'].includes(request.method)) {
          return this[request.method](request)
        } else {
          return new Response(`Unrecognized HTTP method ${request.method} for ${url.pathname}`, { status: 405 })  // TODO: Upgrade these consistent error responses to a class
        }

      case '/ticks':
        // Not yet implemented
        return new Response('/ticks not implemented yet', { status: 404 })

      case '/entity-meta':
        if (request.method === 'GET') return this.GETEntityMeta(request)
        else return new Response(`Unrecognized HTTP method ${request.method} for ${url.pathname}`, { status: 405 })

      default:
        return new Response('Not found', { status: 404 })
    }
  }

  async delete(userID, validFrom, impersonatorID) {
    utils.throwUnless(userID, 'userID required by TemporalEntity DELETE is missing')

    await this.#hydrate()

    utils.throwIf(this.#current?.deleted, 'This TemporalEntity is already deleted', 404)  // TODO: unit test this
    utils.throwUnless(this.#entityMeta?.timeline?.length > 0, 'cannot call TemporalEntity DELETE when there is no prior value')

    let validFromDate
    ({ validFrom, validFromDate } = this.#setValidFrom(validFrom))

    // Update and save the old current
    const oldCurrent = structuredClone(this.#current)
    oldCurrent.meta.validTo = validFrom
    this.state.storage.put(`snapshot-${oldCurrent.meta.validFrom}`, oldCurrent)

    // Create the new current and save it
    this.#current = { value: {} }
    const previousValues = oldCurrent.value  // I'm pretty sure we don't need to use diff here because the new value is {}
    this.#current.meta = {
      userID,
      previousValues,
      validFrom,
      validTo: TemporalEntity.END_OF_TIME,
      eTag: nanoidNonSecure(),
      id: this.state?.id?.toString(),
      deleted: true,
    }
    if (impersonatorID) this.#current.meta.impersonatorID = impersonatorID

    this.#entityMeta.timeline.push(validFrom)
    this.#entityMeta.eTags.push(this.#current.meta.eTag)
    this.state.storage.put('entityMeta', this.#entityMeta)
    this.state.storage.put(`snapshot-${validFrom}`, this.#current)

    return 204
  }

  async DELETE(request) {
    try {
      utils.throwIfContentTypeHeaderInvalid(request)
      const options = await utils.decodeCBORSC(request)
      const status = await this.delete(options.userID, options.validFrom, options.impersonatorID)
      return getStatusOnlyResponse(status)
    } catch (e) {
      return getErrorResponse(e)
    }
  }

  async put(value, userID, validFrom, impersonatorID, eTag) {
    utils.throwUnless(value, 'value required by TemporalEntity PUT is missing')
    utils.throwUnless(userID, 'userID required by TemporalEntity operation is missing')

    await this.#hydrate()

    // Process eTag header
    utils.throwIf(this.#entityMeta.eTags.length > 0 && !eTag, 'ETag header required for TemporalEntity PUT', 428, this.#current)
    utils.throwIf(eTag && eTag !== this.#current?.meta?.eTag, 'If-Match does not match current ETag', 412, this.#current)

    utils.throwIf(this.#current?.deleted, 'PUT on deleted TemporalEntity not allowed', 404)  // TODO: unit test this

    // Set validFrom and validFromDate
    let validFromDate
    ({ validFrom, validFromDate } = this.#setValidFrom(validFrom))

    // Determine if this update should be debounced and set oldCurrent
    let debounce = false
    let oldCurrent = { value: {} }
    if (this.#current) {
      oldCurrent = structuredClone(this.#current)
      if (userID === this.#current?.meta?.userID && validFromDate - new Date(this.#current.meta.validFrom) < 60 * 60 * 1000) {
        debounce = true
        // Make oldCurrent and validFrom be from -2
        oldCurrent = await this.state.storage.get(`snapshot-${this.#entityMeta.timeline.at(-2)}`) ?? { value: {} }
        validFrom = this.#current.meta.validFrom
      }
    }

    // Calculate the previousValues diff and check for idempotency
    const previousValues = diff(value, oldCurrent.value)
    if (Object.keys(previousValues).length === 0) {  // idempotent
      return this.#current
    }

    // Update the old current and save it
    if (!debounce && this.#current) {
      oldCurrent.meta.validTo = validFrom
      this.state.storage.put(`snapshot-${oldCurrent.meta.validFrom}`, oldCurrent)
    }

    // Create the new current and save it
    this.#current = {}
    this.#current.meta = {
      userID,
      previousValues,
      validFrom,
      validTo: TemporalEntity.END_OF_TIME,
      eTag: nanoidNonSecure(),
      id: this.state?.id?.toString(),
    }
    if (impersonatorID) this.#current.meta.impersonatorID = impersonatorID
    this.#current.value = value
    if (debounce) {
      // this.#entityMeta.timeline doesn't change
      this.#entityMeta.eTags[this.#entityMeta.eTags.length - 1] = this.#current.meta.eTag
    } else {
      this.#entityMeta.timeline.push(validFrom)
      this.#entityMeta.eTags.push(this.#current.meta.eTag)
    }
    this.state.storage.put('entityMeta', this.#entityMeta)
    this.state.storage.put(`snapshot-${validFrom}`, this.#current)

    // return the new current
    return this.#current
  }

  async PUT(request) {
    try {
      utils.throwIfMediaTypeHeaderInvalid(request)
      const options = await utils.decodeCBORSC(request)
      const eTag = extractETag(request)
      const current = await this.put(options.value, options.userID, options.validFrom, options.impersonatorID, eTag)
      return getResponse(current)
    } catch (e) {
      return getErrorResponse(e)
    }
  }

  // delta is in the form of a diff from npm package deep-object-diff
  // If you want to delete a key send in a delta with that key set to undefined
  // To add a key, just include it in delta
  // To change a value for one key, just set it to the new value in the delta
  async patch(delta, userID, validFrom, impersonatorID, eTag) {
    utils.throwUnless(delta, 'delta required by TemporalEntity PATCH is missing')

    await this.#hydrate()

    utils.throwUnless(this.#entityMeta?.timeline?.length > 0, 'cannot call TemporalEntity PATCH when there is no prior value')
    utils.throwUnless(eTag, 'ETag header required for TemporalEntity PATCH', 428, this.#current)
    utils.throwIf(this.#current?.deleted, 'PATCH on deleted TemporalEntity not allowed', 404)  // TODO: unit test this

    let newValue
    if (eTag === this.#current?.meta?.eTag) {
      newValue = structuredClone(this.#current.value)
    } else {
      const eTagIndex = this.#entityMeta.eTags.indexOf(eTag)
      const validFromForETag = this.#entityMeta.timeline.at(eTagIndex)
      const newCurrent = await this.state.storage.get(`snapshot-${validFromForETag}`)
      newValue = newCurrent.value
      utils.throwUnless(newValue, 'the eTag you supplied for a TemporalEntity PATCH does not match any prior validFrom', 412, this.#current)
    }
    apply(newValue, delta)

    return this.put(newValue, userID, validFrom, impersonatorID, eTag)
  }

  async PATCH(request) {
    try {
      utils.throwIfMediaTypeHeaderInvalid(request)
      const options = await utils.decodeCBORSC(request)
      const eTag = extractETag(request)
      const current = await this.patch(options.delta, options.userID, options.validFrom, options.impersonatorID, eTag)
      return getResponse(current)
    } catch (e) {
      return getErrorResponse(e)  // TODO: add e2e test for the body of the response
    }
  }

  async get(eTag) {
    await this.#hydrate()
    console.log('inside of get, this.#current', this.#current)
    utils.throwIf(this.#current?.meta?.deleted, 'GET on deleted TemporalEntity not allowed. Use POST to "query" and set includeDeleted to true', 404)  // TODO: unit test this
    console.log('got here')
    if (eTag && eTag === this.#current?.meta?.eTag) return [undefined, 304]
    return [this.#current, 200]
  }

  async GET(request) {
    try {
      utils.throwIfAcceptHeaderInvalid(request)
      const eTag = extractETag(request)
      const [current, status] = await this.get(eTag)
      if (status === 304) return getStatusOnlyResponse(status)
      return getResponse(current)
    } catch (e) {
      return getErrorResponse(e)
    }
  }

  async getEntityMeta(eTag) {
    await this.#hydrate()
    // Note, we don't check for deleted here because we want to be able to get the entityMeta even if the entity is deleted
    if (eTag && eTag === this.#current?.meta?.eTag) return [undefined, 304]
    return [this.#entityMeta, 200]
  }

  async GETEntityMeta(request) {
    try {
      utils.throwIfAcceptHeaderInvalid(request)
      const eTag = extractETag(request)
      const [entityMeta, status] = await this.getEntityMeta(eTag)
      if (status === 304) return getStatusOnlyResponse(304)
      return getResponse(entityMeta, this.#current?.meta?.eTag)
    } catch (e) {
      return getErrorResponse(e)
    }
  }
}
