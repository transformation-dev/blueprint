/* eslint-disable quote-props */
/* eslint-disable no-param-reassign */
/* eslint-disable object-curly-newline */
/* eslint-disable no-restricted-syntax */

import { diff } from 'deep-object-diff'
import { Encoder } from 'cbor-x'

import { debug } from 'svelte/internal'
import * as utils from './utils.js'

const cborSC = new Encoder({ structuredClone: true })

// The DurableObject storage API has no way to list just the keys so we have to keep track of all the
// validFrom dates manually and store them under a key entityMeta.timeline
// For now, timeline will just be an array of ISO date strings.

// TODO: Don't forget to always soft delete to support ETL from last update. Don't forget to include ETag header in response

// TODO: Get Debug() working

// TODO: Set ETag header on GET, PUT, PATCH

// TODO: Stop sending back the error text in the body but rather use the Response statusText option and CBOR-SC encode the body

// TODO: Fix tests that break once I stop sending back the error text in the body

// TODO: Tests at HTTP level for optimistic concurrency:
//   1. Is there an ETag header on GET, PUT, and PATCH?
//   2. Does the ETag header match the validFrom date?
//   3. When you get a 412, do you also get a body with meta, value, and error?

// TODO: Implement optimistic concurrency control with ETag header for GET.
//       If a GET includes an If-None-Match header and it matches this.#current.meta.validFrom, then return 304.
//       Note, a 304 MUST NOT contain a message body which also means it should not have a Content-Type header.

// TODO: Implement ticks

let CBOR_HEADERS
try {
  CBOR_HEADERS = new Headers({ 'Content-Type': 'application/cbor-sc' })
} catch (e) {
  CBOR_HEADERS = undefined  // should only be used in unit testing
}

function getResponse(body, eTag, status = 200) {
  const headers = new Headers({ 'Content-Type': 'application/cbor-sc' })
  if (eTag) {
    headers.set('ETag', eTag)
  } else if (body?.meta?.validFrom) {
    headers.set('ETag', body.meta.validFrom)
  }
  return new Response(cborSC.encode(body), { status, headers })
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

function throwIfConflict(delta1, delta2, body) {  // Throw if the keys are the same and the values are different
  for (const key of Object.keys(delta1)) {
    if (delta1[key] instanceof Object) {
      throwIfConflict(delta1[key], delta2[key], body)
    } else {
      utils.throwIf(
        Object.hasOwn(delta2, key) && delta1[key] !== delta2[key],
        'If-Match failed and new changes conflict with prior changes',
        412,
        body,  // TODO: CBOR-SC encode the body
      )
    }
  }
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
 * moment in time or to retrieve all snapshots in a range will include the current snapshot.
 *
 * The default behavior might deviate from your expectations for a REST-ful API in these ways:
 *  1. PUT behaves like an UPSERT. If there is no prior value, it will create the entity.
 *  2. As such, there is no need for a POST method. A PUT without a prior ID will behave like a POST.
 *  3. PATCH or PUT may still work even if the ETag (see Optimistic Concurrency below) doesn't match
 *     so long as all the updates are to different fields. It will merge all the updates that occured
 *     after the If-Match timestamp so long as they don't conflict. This means you should always replace
 *     your local copy with the value that's returned and never assume that what you sent is what was
 *     stored.
 *  4. The ETag is just the validFrom time so it is only unique to this entity so it probably should be marked as "weak"
 *     but we don't use the "/W" prefix to indicate this.
 *
 * ## Optimistic Concurrency
 *
 * TemporalEntity uses optimistic concurrancy using ETags, If-Match, and If-None-Match headers
 * (see: https://en.wikipedia.org/wiki/HTTP_ETag). The ETag header is provided but it will always match the
 * validFrom so feel free to use that if it's more convenient.
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

  #entityMeta  // Metadata for the entity { timeline }

  #current  // { value, meta }

  #hydrated

  async #hydrate() {
    if (this.#hydrated) return
    this.#entityMeta = await this.state.storage.get('entityMeta')
    this.#entityMeta ??= { timeline: [] }
    if (this.#entityMeta.timeline.length > 0) {
      this.#current = await this.state.storage.get(`snapshot-${this.#entityMeta.timeline.at(-1)}`)
    }
    this.#hydrated = true
  }

  async #throwIfUpdatesConflictElseReturnNewValue(eTag, value) {
    const eTagVersion = await this.state.storage.get(`snapshot-${eTag}`)
    utils.throwIf(!eTagVersion, 'The provided eTag is nowhere in the history for this TemporalEntity', 400)
    // Calculate delta1
    let delta1
    // If the tag is at -2 in the timeline, then use the previousValues as the Delta for this comparison
    if (this.#entityMeta.timeline.length >= 2 && this.#entityMeta.timeline.at(-2) === eTag) {
      delta1 = this.#current.meta.previousValues
    } else { // Otherwise delta1 is the delta from the ETag version to the current version
      delta1 = diff(eTagVersion.value, this.#current.value)
    }

    // Calculate delta2 which is the delta from the ETag version to the proposed new value
    const delta2 = diff(eTagVersion.value, value)

    // Throw if the keys are the same and the values are different
    throwIfConflict(delta1, delta2, this.#current)

    // If it doesn’t throw, then the new value comes from applying delta2 to the current value
    const newValue = structuredClone(this.#current.value)
    apply(newValue, delta2)
    return newValue
  }

  constructor(state, env) {
    this.state = state
    this.env = env
    this.#hydrated = false
    // using this.#hydrated for lazy load rather than this.state.blockConcurrencyWhile(this.#hydrate.bind(this))
  }

  // The body and return is always a CBOR-SC object
  async fetch(request) {
    const url = new URL(request.url)

    switch (url.pathname) {
      case '/':
        if (request.method === 'GET') return this.GET(request)
        if (['PUT', 'PATCH'].includes(request.method)) {
          const response = await this[request.method](request)
          return response
        } else {
          return new Response(`Unrecognized HTTP method ${request.method} for ${url.pathname}`, { status: 405 })
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

  // TODO: Create a schema registry and passing in schemas which will use semantic versioning (e.g. OrgNode@1.7.12)
  //       put() and patch() to allow for the specification of schemas { value, schemas} in the body
  async put(value, userID, validFrom, impersonatorID, eTag) {
    utils.throwUnless(value, 'value required by TemporalEntity PUT is missing')
    utils.throwUnless(userID, 'userID required by TemporalEntity operation is missing')

    await this.#hydrate()

    // Process eTag header
    console.log('*** eTag', eTag)
    utils.throwIf(this.#entityMeta.timeline.length > 0 && !eTag, 'ETag header required for TemporalEntity PUT', 412)
    if (eTag && eTag !== this.#current?.meta?.validFrom) {
      value = await this.#throwIfUpdatesConflictElseReturnNewValue(eTag, value)
    }

    // Set validFrom and validFromDate
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

    // Determine if this update should be debounced and set oldCurrent
    let debounce = false
    let oldCurrent = { value: {} }
    if (this.#current) {
      oldCurrent = structuredClone(this.#current)
      if (userID === this.#current?.meta?.userID && validFromDate - new Date(this.#current.meta.validFrom) < 60 * 60 * 1000) {
        debounce = true
        console.log('*** debounce', debounce)
        // Make oldCurrent and validFrom be from -2
        oldCurrent = await this.state.storage.get(`snapshot-${this.#entityMeta.timeline.at(-2)}`) ?? { value: {} }
        validFrom = this.#current.meta.validFrom
      }
    }

    // Calculate the previousValues diff and check for idempotency
    const previousValues = diff(value, oldCurrent.value)
    console.log('*** oldCurrent', oldCurrent)
    console.log('*** value', value)
    console.log('*** previousValues', previousValues)
    if (Object.keys(previousValues).length === 0) {  // idempotent
      console.log('*** idempotent')
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
      id: this.state?.id?.toString(),
    }
    if (impersonatorID) this.#current.meta.impersonatorID = impersonatorID
    this.#current.value = value
    if (!debounce) {
      this.#entityMeta.timeline.push(validFrom)
      this.state.storage.put('entityMeta', this.#entityMeta)
    }
    console.log('*** this.#current', this.#current)
    this.state.storage.put(`snapshot-${validFrom}`, this.#current)

    // return the new current
    return this.#current
  }

  async PUT(request) {
    const mediaTypeHeaderInvalid = utils.mediaTypeHeaderInvalid(request)
    if (mediaTypeHeaderInvalid) return mediaTypeHeaderInvalid
    let options
    try {
      options = await utils.decodeCBORSC(request)
    } catch (e) {
      const response = new Response('Error decoding your supplied body. Encode with npm package cbor-x using structured clone extension.', { status: 400 })
      return response
    }
    try {
      const eTag = extractETag(request)
      const current = await this.put(options.value, options.userID, options.validFrom, options.impersonatorID, eTag)
      return getResponse(current)
    } catch (e) {
      const status = e.status || 500
      return new Response(e.message, { status })
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
    utils.throwUnless(eTag, 'ETag header required for TemporalEntity PATCH', 412)

    let newValue
    if (eTag === this.#current?.meta?.validFrom) {
      newValue = structuredClone(this.#current.value)
    } else {
      newValue = await this.state.storage.get(`snapshot-${eTag}`)
      utils.throwUnless(newValue, 'the eTag you supplied for a TemporalEntity PATCH does not match any prior validFrom', 412)
    }
    apply(newValue, delta)

    return this.put(newValue, userID, validFrom, impersonatorID, eTag)
  }

  async PATCH(request) {
    const mediaTypeHeaderInvalid = utils.mediaTypeHeaderInvalid(request)
    if (mediaTypeHeaderInvalid) return mediaTypeHeaderInvalid
    let options
    try {
      options = await utils.decodeCBORSC(request)
    } catch (e) {
      return new Response('Error decoding your supplied body. Encode with npm package cbor-x using structured clone extension.', { status: 400 })
    }
    try {
      const eTag = extractETag(request)
      const current = await this.patch(options.delta, options.userID, options.validFrom, options.impersonatorID, eTag)
      return getResponse(current)
    } catch (e) {
      const status = e.status || 500
      return new Response(e.message, { status })
    }
  }

  async get() {
    await this.#hydrate()
    return this.#current
  }

  async GET(request) {
    const acceptHeaderInvalid = utils.acceptHeaderInvalid(request)
    if (acceptHeaderInvalid) return acceptHeaderInvalid
    try {
      const current = await this.get()
      return getResponse(current)
    } catch (e) {
      const status = e.status || 500
      return new Response(e.message, { status })
    }
  }

  async getEntityMeta() {
    await this.#hydrate()
    return this.#entityMeta
  }

  async GETEntityMeta(request) {
    const acceptHeaderInvalid = utils.acceptHeaderInvalid(request)
    if (acceptHeaderInvalid) return acceptHeaderInvalid
    try {
      const entityMeta = await this.getEntityMeta()
      return getResponse(entityMeta, entityMeta?.timeline?.at(-1))
    } catch (e) {
      const status = e.status || 500
      return new Response(e.message, { status })
    }
  }
}
