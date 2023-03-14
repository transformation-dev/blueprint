/* eslint-disable no-param-reassign */  // safe because durable objects are airgapped so to speak
/* eslint-disable no-irregular-whitespace */  // because I use non-breaking spaces in comments

// 3rd party imports
import { diff } from 'deep-object-diff'
import { Validator as JsonSchemaValidator } from '@cfworker/json-schema'
import { load as yamlLoad } from 'js-yaml'

// monorepo imports
import {
  throwIf, throwUnless, isIDString, throwIfMediaTypeHeaderInvalid, throwIfContentTypeHeaderInvalid, throwIfNotDag,
  throwIfAcceptHeaderInvalid, responseMixin, getUUID, extractETag, applyDelta, getDebug, Debug, extractBody,
} from '@transformation-dev/cloudflare-do-utils'

// local imports
// eslint-disable-next-line import/no-unresolved
import testDagSchemaV1String from './schemas/***test-dag***.v1.yaml?raw'  // uses vite's ?raw feature to inline as string
import { temporalMixin } from './temporal-mixin'

// initialize imports
const testDagSchemaV1 = yamlLoad(testDagSchemaV1String)  // convert yaml string to javascript object
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

// TODO A0: Refactor to support the conventions we adopted in TreeBase like save() and updateMetaAndSave(), and If-Modified-Since instead of eTag

// TODO A: Refactor so all methods use destructuring on options/body for parameters

// TODO A: Create People DO. A Person is a just a TemporalEntity but the People DO is not temporal. It'll store the list of people
//       in a single storage object under the key 1 for now but later we can spread it out over multiple storage objects,
//       People batches 2 thru n if you will.

// TODO A: Implement query using npm module sift https://github.com/crcn/sift.js.
//       Support a query parameter to include soft-deleted items in the query but default to not including them.
//       Update the error message for GET.

// TODO A: Cause queries to go down recursively into children of the DAG as well as meta.attachments of the entity

// TODO B: Add a check for invalid type or version name. Cannot have any forward slashs, dashes, or periods.

// TODO B: Make sure all throw messages are constants (for logging) and put the additional context in a context property of the error body

// TODO: B. Timeline

// TODO: B. Implement query against all snapshots that intersect with a Timeline.

// TODO: B. When there is an enum in the schema, use that order for $gt, $gte, $lt, and $lte. Fork sift or convert the query if the left side of $gt, etc. is the fieldname of an enum.
//       Make this work for the value but not entityMeta for now since that has no enum types at the moment.

// TODO: B. Replace cbor-sc with cbor once we get an answer on the GitHub cbor-x discussion board https://github.com/kriszyp/cbor-x/issues/66

// TODO: B. Add migrations to type registry.
//       Migrations can be provided for both directions (upgrade and downgrade). If there is no continuous upgrade or downgrade path from the current
//       version to the desired on, throw an error (406, I think).

// TODO: B. Add the ability to return a body.warnings array in the response. This would be useful for things like deprecated versions that might
//       stop being supported at some point. Even if there exists an appropriate downgrade migration, the client might want to know that the
//       version they are using is not the latest so they can plan to upgrade their code.

// TODO: C. Add a GET /types endpoint that returns all the types and/or...
// TODO: C. OpenAPI documentation. Create top-level schemas for PUT and PATCH requests but don't use them for validation because I want to
//       keep doing that in code because I like my error messages. It's only for documentation. Create schemas for responses.

// TODO: C. Implement ticks

// TODO C: Logging

// TODO: C. Move TemporalEntity to its own package.

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
 * TemporalEntity uses optimistic concurrancy using ETags, If-Match, and If-None-Match headers
 * (see: https://en.wikipedia.org/wiki/HTTP_ETag). The ETag header is sent back for all requests and it will always match the
 * body.meta.eTag so feel free to use the latter that if it's more convenient. Note, our ETag is not the usual hash of the value but rather
 * it is a UUID. I did this because it accomplishes the same goal and I believe that generating a hash of the value would cost more
 * CPU cycles.
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
 * ## Types and versions
 *
 * Here is an example of subclassing TemporalEntityBase and specifying types and versions:
 *
 *     import { TemporalEntityBase } from '@transformation-dev/temporal-entity'
 *     import { throwIfNotDag } from '@transformation-dev/cloudflare-do-utils'
 *
 *     import widgetSchemaV1 from './schemas/widget.v1.yaml'  // use esbuild plugin esbuild-plugin-yaml to inline
 *
 *     export class Entity extends TemporalEntityBase {
 *
 *       static types = {
 *         ...super.types,  // required if you want the defaults identified by type='*', version='*'
 *         'widget': {
 *           versions: {
 *             v1: {  // each version must start with 'v' but you can use anything after that
 *               supressPreviousValues: true,     // defaults to false if not specified
 *               granularity: 'minute',           // defaults to 'hour' if not specified
 *               schema: widgetSchemaV1,
 *               additionalValidation(value) {
 *                 throwIfNotDag(value.dag)
 *               },
 *             },
 *             v2: {  // the order rather than the integer is significant for upgrades and downgrades
 *               ...
 *               upgrade: (priorVersionValueAndMeta) => {...},  // returns the upgraded from v1 { value, meta }
 *               downgrade: (currentVersionValueAndMeta) => {...},  // returns the downgraded to v1 { value, meta }
 *             },
 *           },
 *         },
 *         'zorch': {
 *           versions: {
 *             v1: {
 *               schema: {  // example of inline schema
 *                 type: 'object',
 *                 properties: {
 *                   foo: { type: 'string' },
 *                 },
 *               },
 *             },
 *           },
 *         },
 *       }
 *
 *     }
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
export class TemporalEntityBase {
  static END_OF_TIME = '9999-01-01T00:00:00.000Z'

  static types = {
    '*': {  // default type
      versions: {
        '*': {  // only allowed version with default version
          supressPreviousValues: false,
          hasChildren: false,
          hasParents: false,
          granularity: 3600000,  // 1 hour
        },
      },
    },
    '***test-supress-previous-values***': {
      versions: { v1: { supressPreviousValues: true } },
    },
    '***test-granularity***': {
      versions: { v1: { granularity: 'second' } },
    },
    '***test-dag***': {
      versions: {
        v1: {
          schema: testDagSchemaV1,
          additionalValidation(value) {
            throwIfNotDag(value.dag)
          },
        },
      },
    },
    '***test-has-children-and-parents***': {
      versions: { v1: { hasChildren: true, hasParents: true } },
    },
    '***test-has-children***': {
      versions: { v1: { hasChildren: true } },
    },
  }

  constructor(state, env, type, version, idString) {  // type, version, and idString are only used in unit tests and composition. Cloudflare only passes in two parameters.
    Debug.enable(env.DEBUG)
    this.state = state
    this.env = env
    this.type = type
    this.version = version
    if (idString === 0) this.idString = '0'
    else if (idString != null) this.idString = idString.toString()
    else this.idString = undefined

    Object.assign(this, responseMixin)
    Object.assign(this, temporalMixin)

    this.hydrated = false  // using this.hydrated for lazy load rather than this.state.blockConcurrencyWhile(this.hydrate.bind(this))
  }

  hydrateTypeVersionConfig() {  // We don't store typeVersionConfig which allows for the values to be changed over time
    throwUnless(this.constructor.types[this.type], `Entity type, ${this.type}, not found`, 404)
    const defaultTypeVersionConfig = this.constructor.types['*'].versions['*']
    const lookedUpTypeVersionConfig = this.constructor.types[this.type].versions[this.version]
    throwUnless(lookedUpTypeVersionConfig, `Entity version, ${this.version}, not found for type, ${this.type}`, 404)
    this.typeVersionConfig = {}
    const keys = new Set([...Reflect.ownKeys(defaultTypeVersionConfig), ...Reflect.ownKeys(lookedUpTypeVersionConfig)])
    for (const key of keys) {
      this.typeVersionConfig[key] = lookedUpTypeVersionConfig[key] ?? defaultTypeVersionConfig[key]
      if (key === 'granularity' && typeof this.typeVersionConfig.granularity === 'string') {
        if (['sec', 'second'].includes(this.typeVersionConfig.granularity)) this.typeVersionConfig.granularity = 1000
        else if (['min', 'minute'].includes(this.typeVersionConfig.granularity)) this.typeVersionConfig.granularity = 60000
        else if (['hr', 'hour'].includes(this.typeVersionConfig.granularity)) this.typeVersionConfig.granularity = 3600000
        else if (this.typeVersionConfig.granularity === 'day') this.typeVersionConfig.granularity = 86400000
        else throwIf(true, `Unsupported granularity: ${this.typeVersionConfig.granularity}`, 500)
      }
    }
  }

  async hydrate() {
    debug('hydrate() called')
    debug('this.hydrated: %O', this.hydrated)
    if (this.hydrated) return

    // validation
    throwUnless(this.idString, 'Entity id is required', 404)

    // console.log('this.idString: %O', this.idString)

    // hydrate #entityMeta
    this.entityMeta = await this.state.storage.get(`${this.idString}/entityMeta`) || { timeline: [] }

    // console.log('this.entityMeta: %O', this.entityMeta)

    // hydrate #current
    if (this.entityMeta.timeline.length > 0) {
      this.current = await this.state.storage.get(`${this.idString}/snapshot/${this.entityMeta.timeline.at(-1)}`)
    }

    // console.log('this.current: %O', this.current)

    // preferably, this.type and this.version are set earlier, but if not, we'll try to set them here from this.current.meta
    if (this.type == null && this.current?.meta?.type != null) this.type = this.current.meta.type
    if (this.version == null && this.current?.meta?.version != null) this.version = this.current.meta.version
    this.hydrateTypeVersionConfig()

    this.hydrated = true
  }

  calculateValidFrom(validFrom) {
    let validFromDate
    if (validFrom != null) {
      if (this.entityMeta?.timeline?.length > 0) {
        throwIf(validFrom <= this.entityMeta.timeline.at(-1), 'the validFrom for a TemporalEntity update is not greater than the prior validFrom')
      }
      validFromDate = new Date(validFrom)
    } else {
      validFromDate = new Date()
      if (this.entityMeta?.timeline?.length > 0) {
        const lastTimelineDate = new Date(this.entityMeta.timeline.at(-1))
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

  // eslint-disable-next-line consistent-return
  async fetch(request, urlString) {  // urlString is only used when called in composition by another durable object sharing state and env
    debug('%s %s', request.method, urlString || request.url)
    this.nextStatus = undefined  // TODO: maybe find a way to do this in the lower methods like we do in GET expecting [value, status] from get
    try {
      let pathArray
      if (urlString != null) {
        pathArray = urlString.split('/')
      } else {
        const url = new URL(request.url)
        pathArray = url.pathname.split('/')
      }
      if (pathArray[0] === '') pathArray.shift()  // remove the leading slash

      this.type = pathArray.shift()
      const typeConfig = this.constructor.types[this.type]
      throwUnless(typeConfig, `Unrecognized type ${this.type}`, 404)

      this.version = pathArray.shift()
      if (this.type === '*') throwUnless(this.version === '*', 'The type * can only be used with version *', 404)
      const typeVersionConfig = typeConfig.versions?.[this.version]
      throwUnless(typeVersionConfig, `Unrecognized version ${this.version}`, 404)

      if (this.idString != null) {  // It might be set when instantiated manually
        const otherIDString = pathArray.shift()
        throwIf(otherIDString && otherIDString !== this.idString, `The ID in the URL, ${otherIDString}, does not match the ID in the entity, ${this.idString}`, 404)
      } else if (isIDString(pathArray[0])) {
        this.idString = pathArray.shift()  // remove the ID
      } else {
        this.idString = this.state?.id?.toString()
        this.nextStatus = 201  // This means that the entity was created on this PUT or POST
      }

      const restOfPath = `/${pathArray.join('/')}`

      switch (restOfPath) {
        case '/':
          if (this[request.method] != null) return this[request.method](request)
          return throwIf(true, `Unrecognized HTTP method ${request.method} for ${request.url}`, 405)

        case '/ticks':
          // Not yet implemented
          throwIf(true, '/ticks not implemented yet', 404)
          return this.getStatusOnlyResponse(500)  // this just here temporarily because every case needs to end with a break or return

        case '/entity-meta':  // This doesn't require type or version but this.hydrate does and this needs this.hydrate
          throwUnless(request.method === 'GET', `Unrecognized HTTP method ${request.method} for ${request.url}`, 405)
          return this.GETEntityMeta(request)

        default:
          throwIf(true, `Unrecognized URL ${request.url}`, 404)
      }
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate
      return this.getErrorResponse(e)
    }
  }

  async delete(userID, validFrom, impersonatorID) {
    throwUnless(userID, 'userID required by TemporalEntity DELETE is missing')

    await this.hydrate()

    throwIf(this.current?.meta?.deleted, 'Cannot delete a TemporalEntity that is already deleted', 404)
    throwUnless(this.entityMeta?.timeline?.length > 0, 'cannot call TemporalEntity DELETE when there is no prior value')

    const metaDelta = {
      userID,
      validFrom,
      deleted: true,
    }
    if (impersonatorID != null) metaDelta.impersonatorID = impersonatorID
    await this.patchMetaDelta(metaDelta)
    return 204
  }

  async DELETE(request) {
    try {
      throwIfContentTypeHeaderInvalid(request)
      const options = await extractBody(request)
      const status = await this.delete(options.userID, options.validFrom, options.impersonatorID)
      return this.getStatusOnlyResponse(status)
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate
      return this.getErrorResponse(e)
    }
  }

  async put(value, userID, validFrom, impersonatorID, eTag) {
    throwUnless(value, 'body.value field required by TemporalEntity PUT is missing')
    throwUnless(userID, 'userID required by TemporalEntity operation is missing')

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

    // Process eTag header
    throwIf(this.entityMeta.timeline.length > 0 && !eTag, 'required ETag header for TemporalEntity PUT is missing', 428, this.current)
    throwIf(eTag && eTag !== this.current?.meta?.eTag, 'If-Match does not match this TemporalEntity\'s current ETag', 412, this.current)

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
    debug('previousValues', previousValues)
    if (Object.keys(previousValues).length === 0) {  // idempotent
      return this.current
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
      eTag: getUUID(this.env),
      type: this.type,  // I'm putting this here rather than entityMeta on the off chance that a migration changes the type
      version: this.version,
    }
    if (!this.typeVersionConfig.supressPreviousValues) this.current.meta.previousValues = previousValues
    if (impersonatorID != null) this.current.meta.impersonatorID = impersonatorID
    this.current.value = value
    if (!debounce) {  // timeline only changes if not debounced
      this.entityMeta.timeline.push(validFrom)
      await this.state.storage.put(`${this.idString}/entityMeta`, this.entityMeta)
    }
    await this.state.storage.put(`${this.idString}/snapshot/${validFrom}`, this.current)

    // return the new current
    return this.current
  }

  async PUT(request) {
    try {
      throwIfMediaTypeHeaderInvalid(request)
      throwUnless(this.idString, 'Cannot PUT when there is no prior value')
      const options = await extractBody(request)
      const eTag = extractETag(request)
      const current = await this.put(options.value, options.userID, options.validFrom, options.impersonatorID, eTag)
      return this.getResponse(current, this.nextStatus)
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate
      return this.getErrorResponse(e)
    }
  }

  async POST(request) {  // I originally wrote PUT as an UPSERT but it's better to have a separate POST
    throwUnless(this.nextStatus === 201, 'TemporalEntity POST is only allowed when there is no prior value')
    return this.PUT(request)
  }

  async patchUndelete({ userID, validFrom, impersonatorID }) {
    await this.hydrate()

    throwUnless(this.current?.meta?.deleted, 'Cannot undelete a TemporalEntity that is not deleted')
    const metaDelta = {
      userID,
      validFrom,
      deleted: undefined,
    }
    if (impersonatorID != null) metaDelta.impersonatorID = impersonatorID
    return this.patchMetaDelta(metaDelta)
  }

  async patchDelta({ delta, userID, validFrom, impersonatorID }, eTag) {
    // delta is in the form of a diff from npm package deep-object-diff
    // If you want to delete a key send in a delta with that key set to undefined
    // To add a key, just include it in delta
    // To change a value for one key, just set it to the new value in the delta
    await this.hydrate()

    throwUnless(this.entityMeta?.timeline?.length > 0, 'cannot call TemporalEntity PATCH when there is no prior value')
    throwUnless(eTag, 'ETag header required for TemporalEntity PATCH is missing', 428, this.current)
    throwIf(this.current?.meta?.deleted, 'PATCH with delta on deleted TemporalEntity not allowed', 404)
    throwIf(eTag && eTag !== this.current?.meta?.eTag, 'If-Match does not match this TemporalEntity\'s current ETag', 412, this.current)

    const newValue = structuredClone(this.current.value)

    applyDelta(newValue, delta)

    debug('delta: %O', delta)
    debug('newValue: %O', newValue)

    return this.put(newValue, userID, validFrom, impersonatorID, eTag)
  }

  async patchMetaDelta(metaDelta) {
    await this.hydrate()

    metaDelta.validFrom = this.calculateValidFrom(metaDelta.validFrom).validFrom
    metaDelta.eTag = getUUID(this.env)

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

    return this.current
  }

  async patch(options, eTag) {
    throwUnless(options.userID, 'userID required by TemporalEntity PATCH is missing')

    if (options.undelete != null) return this.patchUndelete(options)  // does not use eTag
    if (options.delta != null) return this.patchDelta(options, eTag)

    return throwIf(
      true,
      'Malformed PATCH on TemporalEntity. Body must include valid operation: delta, undelete, addParent, removeParent, etc.',
      400,
    )
  }

  async PATCH(request) {
    try {
      throwIfMediaTypeHeaderInvalid(request)
      const options = await extractBody(request)
      const eTag = extractETag(request)
      const current = await this.patch(options, eTag)
      return this.getResponse(current)
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate
      return this.getErrorResponse(e)  // TODO: add e2e test for the body of the response
    }
  }

  // async get(eTag) {
  //   await this.hydrate()
  //   throwIf(this.current?.meta?.deleted, 'GET on deleted TemporalEntity not allowed. Use POST to "query" and set includeDeleted to true', 404)
  //   if (eTag != null && eTag === this.current?.meta?.eTag) return [undefined, 304]  // TODO: e2e test for this. Be sure to also look for Content-ID header.
  //   return [this.current, 200]
  // }

  async get(options) {  // TODO: Accept asOfISOString
    const { statusToReturn = 200, ifModifiedSinceISOString, asOfISOString } = options ?? {}
    await this.hydrate()
    throwIf(this.current?.meta?.deleted, 'GET on deleted TemporalEntity not allowed. Use POST to "query" and set includeDeleted to true', 404)
    if (this.entityMeta.timeline.at(-1) <= ifModifiedSinceISOString) return [undefined, 304]
    return [this.current, statusToReturn]
  }

  // async GET(request) {
  //   try {
  //     throwIfAcceptHeaderInvalid(request)
  //     const eTag = extractETag(request)
  //     const [current, status] = await this.get(eTag)
  //     if (status === 304) return this.getStatusOnlyResponse(status)
  //     return this.getResponse(current, status)
  //   } catch (e) {
  //     this.hydrated = false  // Makes sure the next call to this DO will rehydrate
  //     return this.getErrorResponse(e)
  //   }
  // }
}
