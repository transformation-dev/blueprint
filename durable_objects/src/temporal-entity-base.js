/* eslint-disable no-irregular-whitespace */
/* eslint-disable no-use-before-define */
/* eslint-disable quote-props */
/* eslint-disable no-param-reassign */
/* eslint-disable object-curly-newline */

import { diff } from 'deep-object-diff'
import { Encoder } from 'cbor-x'
// TODO: consider switching nanoid out for Crypto.randomUUID() if available in cloudflare
import { nanoid as nanoidNonSecure } from 'nanoid/non-secure'  // should be fine to use the non-secure version since we are only using this for eTags
// import { nanoid } from 'nanoid'

import * as utils from './utils.js'

const cborSC = new Encoder({ structuredClone: true })

// The DurableObject storage API has no way to list just the keys so we have to keep track of all the
// validFrom dates manually and store them under a key entityMeta.timeline
// For now, timeline is just an array of ISO date strings, but later it could be a range-query-optimized b-tree
// if that will help performance. Then again, I could search the array by starting in the middle and
// continuing to split until I've found the right one -- a b-tree-like algorith as opposed to a b-tree data structure.

// To make the code unit testable, I separate the upper-case PUT, GET, etc. from the lower-case put, get, etc.
// The lower-case functions have all the tricky business logic that I test with unit tests.
// The upper-case functions are wrappers and deal with Request and Response objects.
// Lower-case functions will throw errors that are caught by the upper-case functions and turned into
// HTTP responses in a consistent way with a single `getErrorReponse()` function.

// I'm using Microsoft's captialization style for identifiers
// https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/capitalization-conventions
// It's PascalCase for classes/types and camelCase for everything else.
// Acronyms are treated as words, so HTTP is Http, not HTTP, except for two-letter ones, so it's ID, not Id.

// TODO: A-0 Refactor to remove the type from the url and instead use the Content-Type and Accept headers. For example:
//       `application/vnd.transformation.dev.user+cbor; version=1`. In this example user is the type. Note, I'm
//       dropping the -sc suffix from +cbor-sc because the RFC 6839 says that you should only use registered suffixes and cbor-sc is not one.
//       This refactor likely means abandoning the package @transformation-dev/accept which has a bunch of feature we don't need
//       like quality value syntax and creating a much simpler approach that assumes the format `application/vnd.transformation.dev.user+cbor; version=1`
//       Multiple values in an Accept header are separated by commas, so you can parse with something like this:
//           myHeaders.append('Accept-Encoding', 'deflate');
//           myHeaders.append('Accept-Encoding', 'gzip');
//           myHeaders.get('Accept-Encoding'); // Returns "deflate, gzip"
//           myHeaders.get('Accept-Encoding').split(',').map((v) => v.trimStart()); // Returns [ "deflate", "gzip" ]

// TODO: A-1 Add a reference to the DAG validator in types.
//       Since types.js is javascript and the migrations need to be code anyway, let's also make the validation be javascript.
//       We will provide a few helpers though: 1) A DAG validator, and 2) A JSON schema validator. So for instance, you could call JSON schema validator
//       to validate the entire enity value. For the root value, you could use JSON schema to validate the id and children in a recursive schema
//       but also call the DAG validator on the property that is supposed to be the root of a valid DAG.
//       However, we will make each schema be in a separate file named /schemas/<type>.yaml. We can then later reuse these files for OpenAPI
//       Use vite-plugin-yaml to import the YAML files as javascript objects in code for use in the validator.

// TODO: A-2 Remove the keyForDag option once types.js is working

// TODO: A-3 Add a reference to the JSON Schema validation in types using
//       https://github.com/cfworker/cfworker/blob/main/packages/json-schema/README.md.

// TODO: B Implement query using npm module sift. Include an option to include soft-deleted items in the query. Update the error message for GET
//       https://github.com/crcn/sift.js

// TODO: B Implement query against all snapshots using npm module sift

// TODO: C Add migrations to type registry. Use simple integer versioning v1, v2, etc. Use Content-Type and Accept headers with vendor (vnd),
//       for example: `application/vnd.transformation.dev.user+cbor; version=1`. In this example user is the type and v1 is the version.
//       Migrations can be provided for both directions (upgrade and downgrade). Look in the types.migrations object for the
//       desired from and to version and if no migration is found we'll throw an error (406, I think). We should also add a warnings property
//       to all replies if the user still only accepts older versions. Maybe even a stronger warning for versions specified as deprecated.

// TODO: C Add the ability to return a body.warnings array in the response. This would be useful for things like deprecated versions that might
//       stop being supported at some point. Even if there exists an appropriate downgrade migration, the client might want to know that the
//       version they are using is not the latest so they can plan to upgrade their code.

// TODO: C OpenAPI documentation

// TODO: C Get Debug() working

// TODO: C Implement ticks

// TODO: C Move TemporalEntity to its own package.

// TODO: C Specify the Vary header in the response to let caching know what headers were used in content negotiation.

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
 * # TemporalEntityBase
 *
 * TemporalEntity retains its history in a timeline of snapshots. Each snapshot is a copy of the entity's value.
 * validFrom and validTo define the time range for which the snapshot is valid. This approach was invented by
 * Richard Snodgrass (see https://en.wikipedia.org/wiki/Valid_time). The validTo for the current
 * snapshot is set to a date ~8000 years in the future, 9999-01-01T00:00:00.000Z. This makes queries for a particular
 * moment in time or a range include the current snapshot.
 *
 * ## Inheriting from TemporalEntity
 *
 * You can use TemporalEntity as-is with the '*' default type. However, the recommended approach is to inherit from
 * TemporalEntity. You don't need to do this seperately for each type you desire, but you could. Rather, the recommended approach
 * is to import types.js in your inherited class where you specify the types. The main reason why inheriting sepearetly for
 * each type is not recommended is because you'll have to specify each as a separate binding in your wrangler.toml. With the
 * recommended approach, you can specify a single inherited class (e.g. Entity) as the binding and then specify your various
 * types in types.js.
 *
 * ## Granularity and debouncing
 *
 * If the same user makes multiple updates to the same entity within the time period specified by the granularity
 * (default: 1 hour), the updates are merged into a single snapshot, aka debounced. This prevents the history from growing too
 * rapidly in the now common pattern of saving changes in the UI as they are made rather than waiting until the user clicks on
 * a save button. The granularity can be specified as a string (e.g. 'hour'). The most coarse granularity you'll probably ever
 * want is 'day' so that's the coarsest you can specify with a string but you can specify any number of milliseconds by using
 * as an integer rather than a string.
 *
 * ## Using previousValues and when to supress them
 *
 * The meta.previousValues property is used to find or count particular state transitions by only looking at one snapshot at
 * a time. Let's say, you want to know the throughput of a lean/agile development team for a particular two-week sprint. Let's assume
 * the following states for stories: 'To Do', 'In Progress', 'Accepted', and 'Shipped'. You could write a query like this:
 *
 *     meta.validFrom >= '2020-01-01' AND
 *     meta.validFrom < '2020-01-15' AND
 *     value.storyState >= 'Accepted" AND
 *     meta.previousValues.storyState < 'Accepted'
 *
 * To accomplish the same thing without previousValues, you would have to use a query with only the first three conditions and then
 * retrieve the snapshot immediately prior to those by 1st doing a lookup in the timeline and then making another round trip to storage.
 * You'd then have to post-process the results. At least 2x more expensive and perhaps 10x more complex.
 *
 * The cost of storing previousValues is negligible since it's only storing the diff which means only the fields that have changed.
 * The incremental cost of calculating the diff is zero since we calculate it anyway to determine idempotency. In theory, we could
 * have a short-circuited idempotency checker that would be more efficient but it's not worth the complexity especially since the
 * diff is calculated in memory with no I/O. So, you should only supress previousValues if you are sure you'll never want to analyze
 * state transitions and you expect them to be more expensive than normal, for instance for large entities that change frequently and
 * where almost the entire value is changing every update.
 *
 * ## CBOR with structured clone extension encoding
 *
 * The entity value is encoded as CBOR with the structured clone extension using the npm package cbor-x. CBOR is the
 * IEC standardized form of MessagePack. Note, the encoding for plain CBOR seems to be incompatible with the encoding when structured
 * clone is enabled, so I considered using something like +cbor-sc in media type headers but RFC 6839 says that unregistered suffixes are not permitted.
 * So, we'll just have to live with these docs and good error messages unless I can figure out a way to legitimately specify the structured
 * clone extension in the media type. I chose CBOR for the following reasons:
 *   1. With the structured clone extension, it allows you to encode JavaScript objects with directed acyclic graphs (DAGs)
 *      and circular references. The org tree for Transformation.dev Blueprint is a DAG and I needed a way to send
 *      that over the wire so I had to use something like this for at least the transmission of the org tree.
 *   2. It supports essentially all JavaScript types including Dates, Maps, Sets, etc.
 *   3. It's an official standard unlike MessagePack, which is merely a defacto standard, although switching to MessagePack
 *      would be trivial since cbor-x package is derived from the msgpackr package by the same author which is likewise
 *      the fastest MessagePack encoder/decoder.
 *   4. It's faster (at least with cbor-x) for encoding and decoding than anything else (avsc, protobuf, etc.) including native JSON
 *   5. Since it's a binary format, it's more compact than JSON which makes transmission faster and cheaper.
 *      Also, if you have a "sequence" (aka Array) with rows in the same object format, it can be an order of magnitude more compact than JSON,
 *      although that does slow down encoding and that is a different media type suffix, +cbor-seq
 *
 * ## Soft delete and undelete
 *
 * Deletes are always soft meaning that they simply create a new snapshot and set meta.deleted to true. Attempts to GET, PUT,
 * or PATCH with a body.delta field against a soft-deleted entity will result in a 404.
 *
 * You can retrieve a soft-deleted entity by POSTing a query with the includeDeleted option set to true.
 *
 * Unfortunately there is no HTTP method UNDELETE. To undelete, you must PATCH with { undelete: true } in the body.
 * Note: a PATCH body can only have one or the other of delta or undelete.
 *
 * ## Optimistic Concurrency
 *
 * TemporalEntity uses optimistic concurrancy using ETags, If-Match, and If-None-Match headers
 * (see: https://en.wikipedia.org/wiki/HTTP_ETag). The ETag header is sent back for all requests and it will always match the
 * body.meta.eTag so feel free to that latter that if it's more convenient. Note, the ETag is not a hash of the value but rather
 * it is a globally unique random value generated using nanoid (non-secure). I did this because it accomplishes the same goal and
 * I believe that generating a hash of the value would cost more CPU cycles.
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
 *   4. Every response includes a Content-ID header eventhough I'm unsure if this is an appropriate use of that header which seems
 *      to be intended for email. This Content-ID header is the id of the entity. If the response has a body, the Content-ID header
 *      will be the same as body.id. If the response has no body, the Content-ID header is the only way to get the id of the entity.
 *      So, I recommend that all clients always use the Content-ID header because it'll be present even on status-only responses
 *      like 204, and 304. I also don't use the format <id@domain>. Rather, it's just the id without the "<", "@domain", or ">". In my defense,
 *      GMail also just supplies the id. This should be safe since our ids are globally unique. GMail and I assume the "@domain" is
 *      there for cases where the id is not globally unique, like if it was an auto-incrementing counter.
 *
 * ## Types
 *
 * You must specify a type in the first path segment of the URL after the base URL for the temporal-entity proxy
 * (e.g. https://api/temporal-entity/<type>/<id>/...).
 *
 * The convention is to use the types.js file to specify the type but you could do it right in your inherited class. Regardless, it must
 * provide a types object where the key is the name of the type (ie <type> in our example above). The type can have these properrties:
 *   1. supressPreviousValues (default: false)
 *   2. granularity (default: 'hour') - 'second' or 'sec', 'minute' or 'min', 'hour' or 'hr', or 'day' are supported.
 *      You can also just specify an integer number of milliseconds.
 *   3. validation which is javascript code so you can chose to use JSON Schema or utils.throwIfNotDag. Failing validation should throw
 *      an error with utils.HTTPError()
 *   4. warnings (TBD)
 *   5. migrations (TBD)
 *
 * ### Default type
 *
 * You can specify a default type by using '*' (e.g. https://api/temporal-entity/*​/<id>/...). You can override the defaults for the default
 * type by specifying a type named '*' in your types.js file and not including ...super.types or just super.types[*] in the constructor
 * of your inherited class.
 *
 * @constructor
 * @param {DurableObjectState} state
 * @param {DurableObjectEnv} env
 *
 * */
export class TemporalEntityBase {
  static END_OF_TIME = '9999-01-01T00:00:00.000Z'

  static types = {
    '*': {  // default type
      'supressPreviousValues': false,
      'granularity': 3600000,  // 1 hour
      'keyForDag': false,
    },
    '***test-supress-previous-values***': {
      'supressPreviousValues': true,
    },
    '***test-key-for-dag***': {
      'keyForDag': 'dag',
    },
    '***test-granularity***': {
      'granularity': 'second',
    },
  }

  #id

  #type

  #typeConfig

  #entityMeta  // Metadata for the entity { timeline, eTags }

  #current  // { value, meta }

  #hydrated

  constructor(state, env, type) {  // type is only used in unit tests. Cloudflare only passes in two parameters
    this.state = state
    this.env = env
    this.#hydrated = false
    if (type) {  // TODO: add a check that confirms we are not in production or preview since this is only for unit tests
      this.#type = type
    }
    // using this.#hydrated for lazy load rather than this.state.blockConcurrencyWhile(this.#hydrate.bind(this))
  }

  async #hydrate() {
    if (this.#hydrated) return

    // validation
    utils.throwUnless(this.state?.id?.toString() === this.#id, `Entity id mismatch. Url says ${this.#id} but this.state.id says ${this.state.id}.`, 500)
    utils.throwUnless(this.constructor.types[this.#type], `Entity type, ${this.#type}, not found`, 404)

    // hydrate #entityMeta
    this.#entityMeta = await this.state.storage.get('entityMeta')
    if (this.#entityMeta) {
      utils.throwUnless(this.#entityMeta.type === this.#type, `Entity type mismatch. Url says ${this.#type} but entityMeta says ${this.#entityMeta.type}.`, 500)
    } else {
      this.#entityMeta = { timeline: [], eTags: [], type: this.#type }
    }

    // hydrate #type. We don't save type in entityMeta which allows for the values to be changed over time
    const defaultType = this.constructor.types['*']
    const lookedUpType = this.constructor.types[this.#type]  // this.#type is normally set in the fetch handler, but can be set in the constructor for unit tests
    this.#typeConfig = []
    for (const key of Reflect.ownKeys(defaultType).concat(Reflect.ownKeys(lookedUpType))) {
      this.#typeConfig[key] = lookedUpType[key] || defaultType[key]
      if (key === 'granularity' && typeof this.#typeConfig.granularity === 'string') {
        if (['sec', 'second'].includes(this.#typeConfig.granularity)) this.#typeConfig.granularity = 1000
        else if (['min', 'minute'].includes(this.#typeConfig.granularity)) this.#typeConfig.granularity = 60000
        else if (['hr', 'hour'].includes(this.#typeConfig.granularity)) this.#typeConfig.granularity = 3600000
        else if (this.#typeConfig.granularity === 'day') this.#typeConfig.granularity = 86400000
        else utils.throwIf(true, `Unsupported granularity: ${this.#typeConfig.granularity}`, 500)
      }
    }

    // hydrate #current
    if (this.#entityMeta.timeline.length > 0) {
      this.#current = await this.state.storage.get(`snapshot-${this.#entityMeta.timeline.at(-1)}`)
    }

    this.#hydrated = true
  }

  #getResponse(body, status = 200, statusText = undefined) {
    const headers = new Headers({ 'Content-Type': 'application/cbor-sc' })
    headers.set('Content-ID', this.#id)
    if (this.#current?.meta?.eTag) {
      headers.set('ETag', this.#current?.meta?.eTag)
    }
    if (statusText) {
      headers.set('Status-Text', statusText)
    }
    if (body && typeof body === 'object') {
      body.id = this.#id
      return new Response(cborSC.encode(body), { status, headers })
    }
    return new Response(undefined, { status, headers })
  }

  #getErrorResponse(e) {
    if (!e.body) e.body = {}
    e.body.error = { message: e.message, status: e.status }
    return this.#getResponse(e.body, e.status || 500, e.message)
  }

  // eslint-disable-next-line class-methods-use-this
  #getStatusOnlyResponse(status, statusText = undefined) {
    return this.#getResponse(undefined, status, statusText)
  }

  #deriveValidFrom(validFrom) {
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
  // eslint-disable-next-line consistent-return
  async fetch(request) {
    try {
      const url = new URL(request.url)
      const pathArray = url.pathname.split('/')
      if (pathArray[0] === '') pathArray.shift()  // remove the leading slash
      this.#type = pathArray.shift()
      this.#id = pathArray.shift()

      const restOfPath = `/${pathArray.join('/')}`

      switch (restOfPath) {
        case '/':
          utils.throwUnless(
            ['PUT', 'PATCH', 'GET', 'DELETE'].includes(request.method),
            `Unrecognized HTTP method ${request.method} for ${url.pathname}`,
            405,
          )
          return this[request.method](request)

        case '/ticks':
          // Not yet implemented
          utils.throwIf(true, '/ticks not implemented yet', 404)
          return this.#getStatusOnlyResponse(500)  // this just here temporarily because every case needs to end with a break or return

        case '/entity-meta':
          utils.throwUnless(request.method === 'GET', `Unrecognized HTTP method ${request.method} for ${url.pathname}`, 405)
          return this.GETEntityMeta(request)

        default:
          utils.throwIf(true, `Unrecognized URL ${url.pathname}`, 404)
      }
    } catch (e) {
      return this.#getErrorResponse(e)
    }
  }

  async undelete(userID, validFrom, impersonatorID) {
    utils.throwUnless(userID, 'userID required by TemporalEntity UNDELETE is missing')

    await this.#hydrate()

    utils.throwUnless(this.#current?.meta?.deleted, 'Cannot undelete a TemporalEntity is not deleted')

    validFrom = this.#deriveValidFrom(validFrom).validFrom

    // Update and save the old current
    const oldCurrent = structuredClone(this.#current)  // Should be {}
    oldCurrent.meta.validTo = validFrom
    this.state.storage.put(`snapshot-${oldCurrent.meta.validFrom}`, oldCurrent)

    // Create the new current and save it
    const validFromBeforeDelete = this.#entityMeta.timeline.at(-2)
    this.#current = await this.state.storage.get(`snapshot-${validFromBeforeDelete}`)
    const previousValues = diff(this.#current.value, oldCurrent.value)
    this.#current.meta = {
      userID,
      previousValues,
      validFrom,
      validTo: this.constructor.END_OF_TIME,
      eTag: nanoidNonSecure(),
    }
    if (impersonatorID) this.#current.meta.impersonatorID = impersonatorID

    this.#entityMeta.timeline.push(validFrom)
    this.#entityMeta.eTags.push(this.#current.meta.eTag)
    this.state.storage.put('entityMeta', this.#entityMeta)
    this.state.storage.put(`snapshot-${validFrom}`, this.#current)

    return this.#current
  }

  async delete(userID, validFrom, impersonatorID) {
    utils.throwUnless(userID, 'userID required by TemporalEntity DELETE is missing')

    await this.#hydrate()

    utils.throwIf(this.#current?.meta?.deleted, 'Cannot delete a TemporalEntity that is already deleted', 404)
    utils.throwUnless(this.#entityMeta?.timeline?.length > 0, 'cannot call TemporalEntity DELETE when there is no prior value')

    validFrom = this.#deriveValidFrom(validFrom).validFrom

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
      validTo: this.constructor.END_OF_TIME,
      eTag: nanoidNonSecure(),
      // id: this.#id,
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
      return this.#getStatusOnlyResponse(status)
    } catch (e) {
      return this.#getErrorResponse(e)
    }
  }

  async put(value, userID, validFrom, impersonatorID, eTag) {
    utils.throwUnless(value, 'body.value field required by TemporalEntity PUT is missing')
    utils.throwUnless(userID, 'userID required by TemporalEntity operation is missing')

    await this.#hydrate()

    if (this.#typeConfig.keyForDag) utils.throwIfNotDag(value[this.#typeConfig.keyForDag])  // TODO: Move this to validation in types.js

    // Process eTag header
    utils.throwIf(this.#entityMeta.eTags.length > 0 && !eTag, 'required ETag header for TemporalEntity PUT is missing', 428, this.#current)
    utils.throwIf(eTag && eTag !== this.#current?.meta?.eTag, 'If-Match does not match this TemporalEntity\'s current ETag', 412, this.#current)

    utils.throwIf(this.#current?.meta?.deleted, 'PUT on deleted TemporalEntity not allowed', 404)

    // Set validFrom and validFromDate
    let validFromDate
    ({ validFrom, validFromDate } = this.#deriveValidFrom(validFrom))

    // Determine if this update should be debounced and set oldCurrent
    let debounce = false
    let oldCurrent = { value: {} }
    if (this.#current) {
      oldCurrent = structuredClone(this.#current)
      if (
        userID === this.#current?.meta?.userID
        && validFromDate - new Date(this.#current.meta.validFrom) < this.#typeConfig.granularity
      ) {
        debounce = true
        // Make oldCurrent and validFrom be from -2 (or { value: {} }) because we're going to replace the -1 with the new value
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
      validFrom,
      validTo: this.constructor.END_OF_TIME,
      eTag: nanoidNonSecure(),
      // id: this.#id,
    }
    if (!this.#typeConfig.supressPreviousValues) this.#current.meta.previousValues = previousValues
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
      return this.#getResponse(current)
    } catch (e) {
      return this.#getErrorResponse(e)
    }
  }

  // delta is in the form of a diff from npm package deep-object-diff
  // If you want to delete a key send in a delta with that key set to undefined
  // To add a key, just include it in delta
  // To change a value for one key, just set it to the new value in the delta
  async patch(options, eTag) {
    const { delta, undelete, userID, validFrom, impersonatorID } = options
    utils.throwUnless(delta || undelete, 'body.delta or body.undelete required by TemporalEntity PATCH is missing')
    utils.throwIf(delta && undelete, 'only one or the other of body.delta or body.undelete is allowed by TemporalEntity PATCH')

    if (undelete) {
      return this.undelete(userID, validFrom, impersonatorID)
    }

    await this.#hydrate()

    utils.throwUnless(this.#entityMeta?.timeline?.length > 0, 'cannot call TemporalEntity PATCH when there is no prior value')
    utils.throwUnless(eTag, 'ETag header required for TemporalEntity PATCH is missing', 428, this.#current)
    utils.throwIf(this.#current?.meta?.deleted, 'PATCH with delta on deleted TemporalEntity not allowed', 404)
    utils.throwIf(eTag && eTag !== this.#current?.meta?.eTag, 'If-Match does not match this TemporalEntity\'s current ETag', 412, this.#current)

    const newValue = structuredClone(this.#current.value)

    apply(newValue, delta)

    return this.put(newValue, userID, validFrom, impersonatorID, eTag)
  }

  async PATCH(request) {
    try {
      utils.throwIfMediaTypeHeaderInvalid(request)
      const options = await utils.decodeCBORSC(request)
      const eTag = extractETag(request)
      const current = await this.patch(options, eTag)
      return this.#getResponse(current)
    } catch (e) {
      return this.#getErrorResponse(e)  // TODO: add e2e test for the body of the response
    }
  }

  async get(eTag) {
    await this.#hydrate()
    utils.throwIf(this.#current?.meta?.deleted, 'GET on deleted TemporalEntity not allowed. Use POST to "query" and set includeDeleted to true', 404)
    if (eTag && eTag === this.#current?.meta?.eTag) return [undefined, 304]  // e2e test for this. Be sure to also look for Content-ID header.
    return [this.#current, 200]
  }

  async GET(request) {
    try {
      utils.throwIfAcceptHeaderInvalid(request)
      const eTag = extractETag(request)
      const [current, status] = await this.get(eTag)
      if (status === 304) return this.#getStatusOnlyResponse(status)
      return this.#getResponse(current)
    } catch (e) {
      return this.#getErrorResponse(e)
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
      if (status === 304) return this.#getStatusOnlyResponse(304)
      return this.#getResponse(entityMeta)
    } catch (e) {
      return this.#getErrorResponse(e)
    }
  }
}
