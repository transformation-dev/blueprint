/* eslint-disable no-param-reassign */
/* eslint-disable object-curly-newline */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-underscore-dangle */

import { diff } from 'deep-object-diff'
import { Encoder } from 'cbor-x'

const cbor = new Encoder({ structuredClone: true })

// The DurableObject storage API has no way to list all of the keys so we have to keep track of all the
// validFrom dates manually and store the list under a key that's not a date stamp, like maybe "timeline".
// For now, it'll just be an array of ISO date strings. Later we can store the index as defined below.

/* TODO - Maybe add index to speed up searching for the active snapshot for a particular moment in time.

Steps to creating the index:
  - Read all of the validFrom dates into memory. These are the keys to the values in the durable object.
  - Split the list in half and create the first level of the b-tree by specifying the cumulative ranges
    of all the snapshots in each half of the tree.
  - Then do the same recursively down until a half has 2 or fewer nodes

To update the index:
  - If the top level only has 2 children, then:
    - Create a new top level child so the top level now has 3 children instead of 2. Make sure the lookup
      algorithm knows to search all children and not rely upon their being only 2 children.
  - If the 3rd top level child has more than say 5 children, then: add the new entry to the list of possible dates and rebalance
  - Else: add the new entry to this 3rd top level child
*/

// TODO: Don't forget to always soft delete to support ETL from last update

// TODO: Add debounce functionality. Use default of say 1 hour unless overridden by schema

// TODO: Implement optimistic concurrency control using ETag=validFrom and If-Match on PUT or PATCH, but not POST.
//       Send error 412 if If-Match doesn't match this.#current.meta.validFrom
//       Note: implement the confirmation that the new validFrom is greater than the current validFrom
//       Don't worry about implementing If-None-Match because it won't same all that much.

function throwIf(condition, message) {
  if (condition) {
    throw new Error(message)
  }
}

function throwUnless(condition, message) {
  throwIf(!condition, message)
}

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
      this.#current = await this.state.storage.get(this.#entityMeta.timeline.at(-1))
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
        if (['PUT', 'PATCH'].includes(request.method)) return this[request.method](request)
        else return new Response(`Unrecognized HTTP method ${request.method}`, { status: 405 })

      case '/ticks':
        // Not yet implemented
        return new Response('/ticks not implemented yet', { status: 404 })

      default:
        return new Response('Not found', { status: 404 })
    }
  }

  // TODO: Create a schema registry and passing in schemas which will use semantic versioning (e.g. OrgNode@1.7.12)
  //       put() and patch() to allow for the specification of schemas { value, schemas} in the body
  async put(value, userID, validFrom, impersonatorID) {
    throwUnless(value, 'value required by TemporalEntity put() is missing')
    throwUnless(userID, 'userID required by TemporalEntity put() is missing')

    await this.#hydrate()

    if (validFrom && this.#entityMeta?.timeline?.length > 0) {
      throwIf(validFrom <= this.#entityMeta.timeline.at(-1), 'the validFrom for a TemporalEntity update is not greater than the prior validFrom')
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
      this.state.storage.put(oldCurrent.meta.validFrom, oldCurrent)
    }

    this.#current = {}
    this.#current.meta = { userID, previousValues, validFrom, validTo: TemporalEntity.END_OF_TIME }
    if (impersonatorID) this.#current.meta.impersonatorID = impersonatorID
    this.#current.value = value
    this.#entityMeta.timeline.push(validFrom)

    this.state.storage.put(validFrom, this.#current)
    this.state.storage.put('entityMeta', this.#entityMeta)

    return this.#current
  }

  async PUT(request) {
    const ab = await request.arrayBuffer()
    const u8a = new Uint8Array(ab)
    const options = cbor.decode(u8a)
    try {
      const response = await this.put(options.value, options.userID, options.validFrom, options.impersonatorID)
      const responseAB = cbor.encode(response)
      return new Response(responseAB)
    } catch (e) {
      return new Response(e.message, { status: 400 })
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

    throwUnless(delta, 'delta required by TemporalEntity patch() is missing')
    // TODO: throw if no prior value

    await this.#hydrate()
    const newValue = structuredClone(this.#current.value)
    apply(newValue, delta)

    return this.put(newValue, userID, validFrom, impersonatorID)
  }

  async PATCH(request) {
    const options = cbor.decode(await request.arrayBuffer())
    try {
      await this.patch(options.delta, options.userID, options.validFrom, options.impersonatorID)
      return new Response()
    } catch (e) {
      return new Response(e.message, { status: 400 })
    }
  }

  async get() {
    await this.#hydrate()
    return this.#current
  }

  async GET(request) {
    try {
      const result = await this.get()
      return new Response(cbor.encode(result))
    } catch (e) {
      return new Response(e.message, { status: 400 })
    }
  }
}
