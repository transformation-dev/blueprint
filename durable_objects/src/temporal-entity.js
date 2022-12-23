/* eslint-disable no-param-reassign */
/* eslint-disable object-curly-newline */
/* eslint-disable no-restricted-syntax */

import { diff } from 'deep-object-diff'
import { Encoder } from 'cbor-x'

import * as utils from './utils.js'

const cborSC = new Encoder({ structuredClone: true })

// The DurableObject storage API has no way to list just the keys so we have to keep track of all the
// validFrom dates manually and store them under a key entityMeta.timeline
// For now, timeline will just be an array of ISO date strings.

// TODO: Don't forget to always soft delete to support ETL from last update

// TODO: Add debounce functionality. Use default of say 1 hour unless overridden by schema

// TODO: Get Debug() working

// TODO: Implement optimistic concurrency control by setting the ETag to validFrom.
//       On PUT or PATCH if If-Match doesn't match this.#current.meta.validFrom, then check to see if the fields changed are different.
//       If the changes are for different fields, then go ahead with the update. Otherwise send error 412.
//       Don't worry about implementing If-None-Match for get() because it caching won't save all that much.

// TODO: Move all of these to utils

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
  async put(value, userID, validFrom, impersonatorID) {
    utils.throwUnless(value, 'value required by TemporalEntity PUT is missing')
    utils.throwUnless(userID, 'userID required by TemporalEntity operation is missing')

    await this.#hydrate()

    if (validFrom) {
      if (this.#entityMeta?.timeline?.length > 0) {
        utils.throwIf(validFrom <= this.#entityMeta.timeline.at(-1), 'the validFrom for a TemporalEntity update is not greater than the prior validFrom')
      }
    } else {
      let validFromDate = new Date()
      if (this.#entityMeta?.timeline?.length > 0) {
        const lastTimelineDate = new Date(this.#entityMeta.timeline.at(-1))
        if (validFromDate <= lastTimelineDate) {
          validFromDate = new Date(lastTimelineDate.getTime() + 1)
        }
        validFrom = new Date(validFromDate).toISOString()
      } else {
        validFrom = validFromDate.toISOString()
      }
    }

    let oldCurrent
    if (this.#current) {
      oldCurrent = structuredClone(this.#current)
    } else {
      oldCurrent = { value: {} }
    }

    const previousValues = diff(value, oldCurrent.value)
    if (Object.keys(previousValues).length === 0) return this.#current

    if (this.#current) {
      oldCurrent.meta.validTo = validFrom
      this.state.storage.put(`snapshot-${oldCurrent.meta.validFrom}`, oldCurrent)
    }

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
    this.#entityMeta.timeline.push(validFrom)

    this.state.storage.put(`snapshot-${validFrom}`, this.#current)
    this.state.storage.put('entityMeta', this.#entityMeta)

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
      const current = await this.put(options.value, options.userID, options.validFrom, options.impersonatorID)
      return new Response(cborSC.encode(current))  // TODO: Add Content-Type: application/cbor-sc
    } catch (e) {
      const status = e.status || 500
      return new Response(e.message, { status })
    }
  }

  // delta is in the form of a diff from npm package deep-object-diff
  // If you want to delete a key send in a delta with that key set to undefined
  // To add a key, just include it in delta
  // To change a value for one key, just set it to the new value in the delta
  async patch(delta, userID, validFrom, impersonatorID) {
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

    utils.throwUnless(delta, 'delta required by TemporalEntity PATCH is missing')

    await this.#hydrate()

    utils.throwUnless(this.#entityMeta?.timeline?.length > 0, 'cannot call TemporalEntity PATCH when there is no prior value')

    const newValue = structuredClone(this.#current.value)
    apply(newValue, delta)

    return this.put(newValue, userID, validFrom, impersonatorID)
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
      const current = await this.patch(options.delta, options.userID, options.validFrom, options.impersonatorID)
      return new Response(cborSC.encode(current))
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
      return new Response(cborSC.encode(current))
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
      return new Response(cborSC.encode(entityMeta))
    } catch (e) {
      const status = e.status || 500
      return new Response(e.message, { status })
    }
  }
}
