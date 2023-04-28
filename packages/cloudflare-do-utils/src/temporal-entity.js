// @ts-nocheck
/* eslint-disable no-param-reassign */  // safe because durable objects are airgapped so to speak
/* eslint-disable no-irregular-whitespace */  // because I use non-breaking spaces in comments

// 3rd party imports
import { diff } from 'deep-object-diff'
import { Validator as JsonSchemaValidator } from '@cfworker/json-schema'

// monorepo imports
import { errorResponseOut, requestIn } from './content-processor.js'
import { throwIf, throwUnless } from './throws.js'
import { getDebug, Debug } from './debug.js'
import { applyDelta } from './apply-delta.js'
import { dateISOStringRegex } from './date-utils'
import { temporalMixin } from './temporal-mixin'

// initialize imports
const debug = getDebug('blueprint:temporal-entity')

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

// TODO A: Implement query using npm module sift https://github.com/crcn/sift.js.
//       Support a query parameter to include soft-deleted items in the query but default to not including them.
//       Update the error message for GET.

// TODO A: Cause queries to go down recursively into children of the DAG as well as meta.attachments of the entity

// TODO B: Fork deep-object-diff so that Arrays that are different show the entire old array in previousValues rather than an index and value

// TODO: B. Port TZTime.Timeline

// TODO: B. Implement query against all snapshots that intersect with a Timeline.

// TODO: B. When there is an enum in the schema, use that order for $gt, $gte, $lt, and $lte. Fork sift or convert the query if the left side of $gt, etc. is the fieldname of an enum.
//       Make this work for the value but not entityMeta for now since that has no enum types at the moment.

// TODO: B. Add migrations to type registry.
//       Migrations can be provided for both directions (upgrade and downgrade). If there is no continuous upgrade or downgrade path from the current
//       version to the desired on, throw an error (406, I think).

// TODO: B. Add the ability to return a body.warnings array in the response. This would be useful for things like deprecated versions that might
//       stop being supported at some point. Even if there exists an appropriate downgrade migration, the client might want to know that the
//       version they are using is not the latest so they can plan to upgrade their code.

// TODO: C. OpenAPI documentation. Create top-level schemas for PUT and PATCH requests but don't use them for validation because I want to
//       keep doing that in code because I like my error messages. It's only for documentation. Create schemas for responses.

// TODO C: Logging

// TODO: C. Add a HEAD method that returns the same headers as GET but no body.

/**
 * # TemporalEntityBase
 *
 * Instances of TemporalEntityBase retain their history in a timeline of snapshots. Each snapshot has a complete a copy of the entity's
 * value for that moment in time along with meta like validFrom and validTo. validFrom and validTo define the time range for which the
 * snapshot is... well... valid. This approach was invented by Richard Snodgrass and his doctoral student
 * (see https://en.wikipedia.org/wiki/Valid_time).
 *
 * ## Inheriting from TemporalEntityBase
 *
 * You can play around with TemporalEntityBase as-is with the default type, '*', and version, also '*'
 * (e.g. https://api/temporal-entity/*​/*​/<id>/...). However, you almost certainly want to subclass TemporalEntityBase. Even then,
 * there are two possible approaches:
 *   1. Create a generic subclass (e.g. TemporalEntity) and provide schemas, migrations, and other specifications for each type. These type
 *      specifications are quite flexible and the configurable behavior of the endpoints/methods address all use cases I can think
 *      of, but you never know so...
 *   2. If the unforseen happens and you want a "type" with additional endpoints/methods or different behavior for the existing ones,
 *      you can extend TemporalEntityBase and add or override at will. Remember to specify your subclass as a separate binding in
 *      your wrangler.toml file.
 *
 * ### Q: Why didn't I just use a dependency injection approach rather than this inheritance approach?
 *
 * Several reasons:
 *   1. You need to upload your durable objects to Cloudflare as a JavaScript Class anyway.
 *   2. Mechanisms I thought of to inject types after it's already in Cloudflare as a class all struck me as unecessary complexity
 *      for my current needs. The trickiest aspect is injecting functions that are used for migrations and additionalValidation (see below).
 *      I would have to upload those separately as Cloudflare Workers and make an over-the-wire call to them which would have a performance
 *      penalty. That said, if I ever want to offer this as a backend-as-a-service (BaaS), I'll need to do something like that,
 *      maybe using Cloudflare Workers for Platforms.
 *   3. This inheritence approach allows you to add additional endpoints/methods or override the behavior of the existing ones
 *      (approach #2 above). That said, I'm not sure if anyone ever needs to do that so this might not turn out to be a reason in the end.
 *
 * ## Granularity and debouncing
 *
 * If the same user makes multiple updates to the same entity within the time period specified by the granularity
 * (default: 1 hour), the updates are merged into a single snapshot, aka debounced. This prevents the history from growing too
 * rapidly in the now common pattern of saving changes in the UI as they are made rather than waiting until the user clicks on
 * a save button. The granularity can be specified as a string ('day', 'hour', etc.). The most coarse granularity you'll probably
 * ever want is 'day' so that's the coarsest you can specify with a string but you can specify any number of milliseconds by using
 * as an integer rather than a string.
 *
 * ## Using previousValues and when to supress them
 *
 * The meta.previousValues property is used to find or count particular state transitions by only looking at one snapshot at
 * a time. Let's say, you want to know the throughput of stories "Accepted" by a lean/agile development team for a particular
 * two-week sprint. You could write a query like this:
 *
 *     meta.validFrom >= '2020-01-01' AND
 *     meta.validFrom < '2020-01-15' AND
 *     value.storyState >= 'Accepted" AND
 *     meta.previousValues.storyState < 'Accepted'
 *
 * To accomplish the same thing without previousValues, you would have to use a query with only the first three conditions and then
 * retrieve the snapshot immediately prior to those by 1st doing a lookup in the timeline and then making another round trip to storage
 * for each result of your first query. You'd then have to post-process the results. It's potentially several orders of magnitude more
 * expensive and it's signficantly more complex. PreviousValues is my (Larry Maccherone's) standing-on-the-shoulders-of-giants
 * contribution, where the giants are Richard Snodgrass and his doctoral student.
 *
 * The cost of storing previousValues is negligible since it's only storing the diff which means only the fields that have changed.
 * The incremental cost of calculating the diff is zero since we calculate it anyway to determine idempotency. So, you should only
 * use the supressPreviousValues configuration option if you are sure you'll never want to analyze state transitions and you expect
 * them to be more expensive than normal, for instance for large entities that change frequently and where almost the entire value is
 * changing every update.
 *
 * ## CBOR with structured clone extension encoding
 *
 * The entity value is encoded as CBOR with the structured clone extension using the npm package cbor-x. CBOR is the
 * IEC standardized form of MessagePack. Note, the encoding for plain CBOR seems to be incompatible with the encoding when structured
 * clone is enabled, so I considered using my own media type (application/cbor-sc) but RFC 6839 disallows that.
 * So, we'll just have to live with these docs and good error messages unless I can figure out a way to legitimately specify the structured
 * clone extension in the media type.
 *
 * I chose CBOR for the following reasons:
 *   1. With the structured clone extension, it allows you to encode JavaScript objects with directed acyclic graphs (DAGs). The org tree
 *      for Transformation.dev Blueprint is a DAG and I needed a way to send that over the wire so I had to use something like this for at
 *      least the transmission of the org tree.
 *   2. It supports essentially all JavaScript types including Dates, Maps, Sets, etc.
 *   3. It's an official standard unlike MessagePack, which is merely a defacto standard, although switching to MessagePack
 *      would be trivial since cbor-x package is derived from the msgpackr package by the same author which is likewise
 *      the fastest MessagePack encoder/decoder.
 *   4. It's faster (at least with cbor-x) for encoding and decoding than anything else (avsc, protobuf, etc.) including native JSON
 *   5. Since it's a binary format, it's more compact than JSON which makes transmission faster and cheaper.
 *      Also, if you have a "sequence" (aka Array) with rows in the same object format, it can be an order of magnitude more compact than JSON,
 *      although that does slow down encoding and that is a different media type, application/cbor-seq
 *
 * ## Soft delete and undelete
 *
 * Deletes are always soft meaning that they simply create a new snapshot and set meta.deleted to true. Attempts to GET, PUT,
 * or PATCH against a soft-deleted entity will result in a 404.
 *
 * You can retrieve a soft-deleted entity by POSTing a query with the includeDeleted option set to true.
 *
 * Unfortunately there is no HTTP method UNDELETE. To undelete, you must PATCH with { undelete: true } in the body.
 * Note: a PATCH body can only have one or the other of delta or undelete.
 *
 * ## Optimistic Concurrency
 *
 * TemporalEntity uses optimistic concurrancy using If-Unmodified-Since header. meta.validFrom is sent back for all requests.
 * Use that to populate If-Unmodified-Since on subsequent requests.
 *
 * Similarly, you can save the cost of a GET by using If-Modified-Since when GETing. It will return a 304 if the entity has not changed.
 *
 * ## Deviations from pure REST APIs
 *
 * The REST-like behavior of TemporalEntityBase might deviate from your expectations for a pure REST API in these ways:
 *   1. PATCH is our Jack of all trades method. As expected, when a delta field is provided, it will partially update an entity
 *      but it is also used to undelete as well as manipulate parents and children.
 *   2. Unlike HTTP/1.1, HTTP/2 infrastructure and/or libraries tend to overwrite Status-Text to match the Status code. So,
 *      while we attempt to supply a more useful Status-Text in the header, error responses also include a body with an error
 *      field which in turn has a useful message field. Error bodies are also encoded in CBOR using the structured clone extension.
 *
 * ## Using the @transformation-dev/cloudflare-do-proxy
 *
 * You must specify a type and version in the first two path segments after the base URL
 * (e.g. https://api/temporal-entity/<type>/<version>/<id>/...).
 *
 *
 * @constructor
 * @param {DurableObjectState} state
 * @param {DurableObjectEnv} env
 *
 * */
export class TemporalEntity {
  static END_OF_TIME = '9999-01-01T00:00:00.000Z'

  // typeVersionConfig: {
  //  type: string,
  //  version: string,
  //  schema: JSON schema object,
  //  additionalValidation: (object) => boolean; Return true if valid. Throw if not valid.
  //  granularity: string or integer milliseconds,
  //  supressPreviousValues: boolean,
  // }
  constructor(state, env, typeVersionConfig) {  // Cloudflare only passes in 2 parameters, so either subclass and call super() or use in composition (like we do in versioningTransactionalDOWrapper) with a 3rd parameter
    throwUnless(typeVersionConfig != null, 'typeVersionConfig is required as the third parameter when creating a TemporalEntityBase instance', 500)
    Debug.enable(env.DEBUG)
    this.state = state
    this.env = env
    this.typeVersionConfig = typeVersionConfig
    this.hydrateTypeVersionConfig()
    this.idString = this.state.id.toString()

    Object.assign(this, temporalMixin)

    this.hydrated = false  // using this.hydrated for lazy load rather than this.state.blockConcurrencyWhile(this.hydrate.bind(this))
  }

  hydrateTypeVersionConfig() {
    if (this.typeVersionConfig?.granularity != null && typeof this.typeVersionConfig.granularity === 'string') {
      if (['sec', 'second'].includes(this.typeVersionConfig.granularity)) this.typeVersionConfig.granularity = 1000
      else if (['min', 'minute'].includes(this.typeVersionConfig.granularity)) this.typeVersionConfig.granularity = 60000
      else if (['hr', 'hour'].includes(this.typeVersionConfig.granularity)) this.typeVersionConfig.granularity = 3600000
      else if (this.typeVersionConfig.granularity === 'day') this.typeVersionConfig.granularity = 86400000
      else throwIf(true, `Unsupported granularity: ${this.typeVersionConfig.granularity}`, 500)
    }
  }

  async hydrate() {
    // debug('hydrate() called. this.hydrated: %O', this.hydrated)
    if (this.hydrated) return

    // hydrate #entityMeta
    this.entityMeta = await this.state.storage.get(`${this.idString}/entityMeta`) || { timeline: [] }

    // hydrate #current
    if (this.entityMeta.timeline.length > 0) {
      this.current = await this.state.storage.get(`${this.idString}/snapshot/${this.entityMeta.timeline.at(-1)}`)
    }

    this.hydrated = true
  }

  // eslint-disable-next-line consistent-return
  async fetch(request) {
    debug('%s %s', request.method, request.url)
    this.warnings = []
    try {
      const url = new URL(request.url)
      const pathArray = url.pathname.split('/').filter((s) => s !== '')

      const restOfPath = `/${pathArray.join('/')}`

      switch (restOfPath) {
        case '/':
          if (this[request.method] != null) return await this[request.method](request)
          return throwIf(true, `Unrecognized HTTP method ${request.method} for ${request.url}`, 405)

        case '/ticks':
          // Not yet implemented
          throwIf(true, '/ticks not implemented yet', 404)
          return this.doResponseOut(undefined, 500)  // this just here temporarily because every case needs to end with a break or return

        case '/entity-meta':  // This doesn't require type or version but this.hydrate does and this needs this.hydrate
          throwUnless(request.method === 'GET', `Unrecognized HTTP method ${request.method} for ${request.url}`, 405)
          return await this.GETEntityMeta(request)

        default:
          throwIf(true, `Unrecognized URL ${request.url}`, 404)
      }
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate
      return errorResponseOut(e, this.env, this.idString)
    }
  }

  async delete(userID, validFrom, impersonatorID) {
    throwUnless(userID, 'userID required by TemporalEntity DELETE is missing')

    await this.hydrate()

    if (this.current?.meta?.deleted) return [this.current, 200]
    throwUnless(this.entityMeta?.timeline?.length > 0, 'cannot call TemporalEntity DELETE when there is no prior value')

    const metaDelta = {
      userID,
      validFrom,
      deleted: true,
    }
    if (impersonatorID != null) metaDelta.impersonatorID = impersonatorID
    await this.patchMetaDelta(metaDelta)
    return [this.current, 200]
  }

  async DELETE(request) {
    const { content: options } = await requestIn(request)
    const [responseBody, status] = await this.delete(options.userID, options.validFrom, options.impersonatorID)
    return this.doResponseOut(responseBody, status)
  }

  async put(value, userID, validFrom, impersonatorID, ifUnmodifiedSince) {
    throwUnless(value, 'body.value field required by TemporalEntity PUT is missing')
    throwUnless(userID, 'userID required by TemporalEntity operation is missing')
    throwIf(
      ifUnmodifiedSince != null && !dateISOStringRegex.test(ifUnmodifiedSince),
      'If-Unmodified-Since must be in YYYY:MM:DDTHH:MM:SS.mmmZ format because we need millisecond granularity',
      400,
      this.current,
    )

    await this.hydrate()

    const { schema } = this.typeVersionConfig
    if (schema != null) {
      const schemaValidator = new JsonSchemaValidator(schema)
      const result = schemaValidator.validate(value)
      throwUnless(result.valid, `Schema validation failed. Error(s):\n${JSON.stringify(result.errors, null, 2)}`)
    }
    const { additionalValidation } = this.typeVersionConfig
    if (additionalValidation != null) {
      additionalValidation(value)
    }

    // Process ifUnmodifiedSince header
    throwIf(this.entityMeta.timeline.length > 0 && ifUnmodifiedSince == null, 'required If-Unmodified-Since header for TemporalEntity PUT is missing', 428, this.current)
    throwIf(ifUnmodifiedSince != null && ifUnmodifiedSince < this.current?.meta?.validFrom, 'If-Unmodified-Since is earlier than the last time this TemporalEntity was modified', 412, this.current)

    throwIf(this.current?.meta?.deleted, 'PUT on deleted TemporalEntity not allowed', 404)

    // Set validFrom and validFromDate
    let validFromDate
    ({ validFrom, validFromDate } = this.calculateValidFrom(validFrom))

    // Determine if this update should be debounced and set oldCurrent
    let debounce = false
    let oldCurrent = { value: {} }
    if (this.current != null) {
      oldCurrent = structuredClone(this.current)
      if (
        userID === this.current?.meta?.userID
        && validFromDate - new Date(this.current.meta.validFrom) < this.typeVersionConfig.granularity
      ) {
        debounce = true
        // Make oldCurrent and validFrom be from -2 (or { value: {} }) because we're going to replace the -1 with the new value
        oldCurrent = await this.state.storage.get(`${this.idString}/snapshot/${this.entityMeta.timeline.at(-2)}`) ?? { value: {} }
        validFrom = this.current.meta.validFrom
      }
    }

    // Calculate the previousValues diff and check for idempotency
    const previousValues = diff(value, oldCurrent.value)
    if (Object.keys(previousValues).length === 0) {  // idempotent
      return this.get()
    }

    // Update the old current and save it
    if (!debounce && this.current != null) {
      oldCurrent.meta.validTo = validFrom
      await this.state.storage.put(`${this.idString}/snapshot/${oldCurrent.meta.validFrom}`, oldCurrent)
    }

    // Create the new current and save it
    this.current = {}
    this.current.meta = {
      userID,
      validFrom,
      validTo: this.constructor.END_OF_TIME,
    }
    if (!this.typeVersionConfig.supressPreviousValues) this.current.meta.previousValues = previousValues
    if (impersonatorID != null) this.current.meta.impersonatorID = impersonatorID
    this.current.value = value
    if (!debounce) {  // timeline only changes if not debounced
      this.entityMeta.timeline.push(validFrom)
      await this.state.storage.put(`${this.idString}/entityMeta`, this.entityMeta)
    }
    await this.state.storage.put(`${this.idString}/snapshot/${validFrom}`, this.current)

    // TODO A0: Send update to queue
    // await this.env.BLUEPRINT.send('something')

    // return the new current
    return this.get()
  }

  async PUT(request) {
    const { content: options } = await requestIn(request)
    const ifUnmodifiedSince = request.headers.get('If-Unmodified-Since')
    const [responseBody, status] = await this.put(options.value, options.userID, options.validFrom, options.impersonatorID, ifUnmodifiedSince)
    return this.doResponseOut(responseBody, status)
  }

  async post(value, userID, validFrom, impersonatorID, ifUnmodifiedSince) {
    const [responseBody, status] = await this.put(value, userID, validFrom, impersonatorID, ifUnmodifiedSince)
    if (status === 200) return [responseBody, 201]
    else return [responseBody, status]
  }

  async POST(request) {
    const { content: options } = await requestIn(request)
    const ifUnmodifiedSince = request.headers.get('If-Unmodified-Since')
    const [responseBody, status] = await this.post(options.value, options.userID, options.validFrom, options.impersonatorID, ifUnmodifiedSince)
    return this.doResponseOut(responseBody, status)
  }

  async patchUndelete({ userID, validFrom, impersonatorID }) {
    await this.hydrate()

    validFrom = this.calculateValidFrom(validFrom).validFrom

    throwUnless(this.current?.meta?.deleted, 'Cannot undelete a TemporalEntity that is not deleted')
    const metaDelta = {
      userID,
      validFrom,
      deleted: undefined,
    }
    if (impersonatorID != null) metaDelta.impersonatorID = impersonatorID
    await this.patchMetaDelta(metaDelta)
    return this.get()
  }

  async patchDelta({ delta, userID, validFrom, impersonatorID }, ifUnmodifiedSince) {
    // delta is in the form of a diff from npm package deep-object-diff
    // If you want to delete a key send in a delta with that key set to undefined
    // To add a key, just include it in delta
    // To change a value for one key, just set it to the new value in the delta
    await this.hydrate()

    throwUnless(this.entityMeta?.timeline?.length > 0, 'cannot call TemporalEntity PATCH when there is no prior value')
    throwIf(this.current?.meta?.deleted, 'PATCH with delta on deleted TemporalEntity not allowed', 404)

    const newValue = structuredClone(this.current.value)

    applyDelta(newValue, delta)

    return this.put(newValue, userID, validFrom, impersonatorID, ifUnmodifiedSince)
  }

  async patchMetaDelta(metaDelta) {
    await this.hydrate()

    metaDelta.validFrom = this.calculateValidFrom(metaDelta.validFrom).validFrom

    // Update and save the old current
    const oldCurrent = structuredClone(this.current)
    oldCurrent.meta.validTo = metaDelta.validFrom
    await this.state.storage.put(`${this.idString}/snapshot/${oldCurrent.meta.validFrom}`, oldCurrent)

    // apply metaDelta to current.meta and save it
    applyDelta(this.current.meta, metaDelta)
    this.current.meta.previousValues = {}  // value never changes in a patchMetaDelta
    this.entityMeta.timeline.push(metaDelta.validFrom)
    await this.state.storage.put(`${this.idString}/entityMeta`, this.entityMeta)
    await this.state.storage.put(`${this.idString}/snapshot/${metaDelta.validFrom}`, this.current)
  }

  async patch(options, ifUnmodifiedSince) {
    throwUnless(options.userID, 'userID required by TemporalEntity PATCH is missing')

    if (options.undelete != null) return this.patchUndelete(options)
    if (options.delta != null) return this.patchDelta(options, ifUnmodifiedSince)

    return throwIf(
      true,
      'Malformed PATCH on TemporalEntity. Body must include valid operation: delta, undelete, addParent, removeParent, etc.',
      400,
    )
  }

  async PATCH(request) {
    const { content: options } = await requestIn(request)
    const ifUnmodifiedSince = request.headers.get('If-Unmodified-Since')
    const [responseBody, status] = await this.patch(options, ifUnmodifiedSince)
    return this.doResponseOut(responseBody, status)

    // TODO: Delete the below if it continues to pass all tests
    // try {
    //   const { content: options } = await requestIn(request)
    //   const ifUnmodifiedSince = request.headers.get('If-Unmodified-Since')
    //   const [responseBody, status] = await this.patch(options, ifUnmodifiedSince)
    //   return this.doResponseOut(responseBody, status)
    // } catch (e) {
    //   this.hydrated = false  // Makes sure the next call to this DO will rehydrate
    //   return errorResponseOut(e, this.env, this.idString)
    // }
  }

  async get(options) {  // TODO: Accept asOfISOString
    const { statusToReturn = 200, ifModifiedSince, asOfISOString } = options ?? {}
    throwIf(
      ifModifiedSince != null && !dateISOStringRegex.test(ifModifiedSince),
      'If-Modified-Since must be in YYYY:MM:DDTHH:MM:SS.mmmZ format because we need millisecond granularity',
      400,
      this.current,
    )
    await this.hydrate()
    throwIf(this.current?.meta?.deleted, 'Resource is soft deleted. If you DELETE again, it will return the current value and meta.', 404)
    if (this.entityMeta.timeline.at(-1) <= ifModifiedSince) return [undefined, 304]
    return [this.current, statusToReturn]
  }
}
