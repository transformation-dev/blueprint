/* eslint-disable no-param-reassign */  // safe because durable objects are airgapped so to speak
/* eslint-disable no-irregular-whitespace */  // because I use non-breaking spaces in comments

// 3rd party imports
import Debug from 'debug'

// local imports
import * as utils from './utils.js'
import responseMixin from './response-mixin.js'

// initialize imports
const debug = utils.getDebug('blueprint:temporal-entity')

// TODO: A. Create a new DO named Tree
//       The nodes will all be TemporalEntity instances via composition which means we'll call the lowercase get, put, patch, etc. methods and need to generate an idString
//       Create the root node when the Tree is created (POST). Store the idString of the root in the Tree state.
//       The root node will not have a meta.parents field.

// TODO: A. PATCH addParent. Also changes the children field of the parent. Errors unless hasParents is true

// TODO: A. PATCH removeParent. Also changes the children field of the parent. Changes to a delete if last parent. Errors unless hasParents is true

// TODO: A. PATCH move. Sugar for removeParent and addParent

// TODO: A. Tree.POST .../[parentType]/[parentVersion]/[parentIDString]/[childType]/[childVersion] without an idString will create a new child

/*

org-tree: {  // Tree w/ org-tree type
  rootNode: idString,  // "0"
  nodeIDCounter: number,  // start at 0
}

org-tree-root-node: {  // TemporalEntity w/ org-tree-root-node type. Add a flag in TemporalEntity type for hasChildren
  value: {
    label: string,
    emailDomains: [string],
  },
  meta: { children: [idString] },
}

org-tree-node: {  // TemporalEntity w/ org-tree-node type. Add a flag in TemporalEntity type for hasParents
  value: { label: string },
  meta: {
    children: [idString],
    parents: [idString],
  },
}

/org-tree/v1/<treeIDString>
  PUT - creates the tree with the root node as the value from the body
  GET - returns the DAG with just labels and children

/org-tree/v1/<treeIDString>/aggregate
  POST - alias for /aggregate against the root node

/org-tree/v1/<treeIdString>/org-node/v1/<nodeIDString>
  POST creates a new child of nodeIDString. Body is the value for the new node. This is done by Tree not TemporalEntity
  GET, PUT, PATCH delta/undelete, and DELETE just like a TemporalEntity
  PATCH with { addParent: { parent: idString } }
  PATCH with { removeParent: { parent: idString } }
  PATCH with { move: { currentParent: idString, newParent: idString } }

/org-tree/v1/<treeIdString>/org-node/v1/<nodeIDString>/aggregate
  POST - execute the aggregation. First version just gathers all matching nodes.

*/

/**
 * # Tree
 *
 *
 * @constructor
 * @param {DurableObjectState} state
 * @param {DurableObjectEnv} env
 *
 * */
export class Tree {
  constructor(state, env, idString) {  // idString is only used in unit tests and composition. Cloudflare only passes in two parameters.
    Debug.enable(env.DEBUG)
    this.state = state
    this.env = env
    this.idString = idString

    Object.assign(this, responseMixin)

    this.hydrated = false  // using this.hydrated for lazy load rather than this.state.blockConcurrencyWhile(this.hydrate.bind(this))
  }

  async hydrate() {
    debug('hydrate() called')
    debug('this.hydrated: %O', this.hydrated)
    if (this.hydrated) return

    // validation
    utils.throwUnless(this.idString, 'Entity id is required', 404)
    utils.throwIf(
      this.state?.id && this.state?.id?.toString() !== this.idString,
      `Entity id mismatch. Url says ${this.idString} but this.state.id says ${this.state?.id}.`,
      500,
    )

    // hydrate #entityMeta
    this.entityMeta = await this.state.storage.get(`${this.idString}/entityMeta`) || { nodeCount: 0, lastValidFrom: null }

    this.hydrated = true
  }

  getUUID() {
    if (this.env.crypto?.randomUUID) return this.env.crypto.randomUUID()
    if (crypto?.randomUUID) return crypto.randomUUID()
    else return utils.throwIf(true, 'crypto.randomUUID() not in the environment', 500)
  }

  deriveValidFrom(validFrom) {  // this is different from the one in TemporalEntity
    let validFromDate
    if (validFrom) {
      utils.throwIf(this.entityMeta.lastValidFrom && validFrom <= this.entityMeta.lastValidFrom, 'the provided validFrom for a Tree update is not greater than the last validFrom')
      validFromDate = new Date(validFrom)
    } else {
      validFromDate = new Date()
      if (this.entityMeta?.lastValidFrom) {
        const lastValidFromDate = new Date(this.entityMeta.lastValidFrom)
        if (validFromDate <= lastValidFromDate) {
          validFromDate = new Date(lastValidFromDate.getTime() + 1)
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
    debug('%s %s', request.method, request.url)
    this.nextStatus = undefined
    try {
      const url = new URL(request.url)
      const pathArray = url.pathname.split('/')
      if (pathArray[0] === '') pathArray.shift()  // remove the leading slash

      if (utils.isIDString(pathArray[0])) {
        this.idString = pathArray.shift()  // remove the ID
      } else {
        this.idString = this.state?.id?.toString()
        this.nextStatus = 201  // This means that the entity was created on this PUT or POST
      }

      const restOfPath = `/${pathArray.join('/')}`

      switch (restOfPath) {
        case '/':
          if (this[request.method]) return this[request.method](request)
          return utils.throwIf(true, `Unrecognized HTTP method ${request.method} for ${url.pathname}`, 405)

        case '/entity-meta':  // This doesn't require type or version but this.hydrate does and this needs this.hydrate
          utils.throwUnless(request.method === 'GET', `Unrecognized HTTP method ${request.method} for ${url.pathname}`, 405)
          return this.GETEntityMeta(request)

        default:
          return utils.throwIf(true, `Unrecognized URL ${url.pathname}`, 404)
      }
    } catch (e) {
      return this.getErrorResponse(e)
    }
  }

  async post({ rootNode, userID, validFrom, impersonatorID }) {
    const { value, type, version } = rootNode
    utils.throwUnless(value && type && version, 'body.rootNode with value, type, and version required when Tree is create')
    utils.throwUnless(userID, 'userID required by Tree operation is missing')

    await this.hydrate()

    // Set validFrom and validFromDate
    let validFromDate
    ({ validFrom, validFromDate } = this.deriveValidFrom(validFrom))

    // TODO: Create root node

    // If the root node creation works, then update entityMeta
    this.entityMeta.userID = userID
    this.entityMeta.validFrom = validFrom
    this.entityMeta.lastValidFrom = validFrom
    if (impersonatorID) this.entityMeta.impersonatorID = impersonatorID

    this.state.storage.put(`${this.idString}/entityMeta`, this.entityMeta)

    // return the new current
    return this.entityMeta
  }

  async POST(request) {
    try {
      utils.throwIfMediaTypeHeaderInvalid(request)
      const options = await utils.decodeCBORSC(request)
      const entityMeta = await this.post(options)
      return this.getResponse(entityMeta, this.nextStatus)
    } catch (e) {
      return this.getErrorResponse(e)
    }
  }

  // TODO: Edit and merge patchAddChild and patchAddParent below into patchAddBranch
  async patchAddChild({ addChild, userID, validFrom, impersonatorID }) {
    const { childID, dontPropogate = false } = addChild
    utils.throwIf(utils.isIDString(childID), 'Parent/child relationships across separate durable objects not yet supported by TemporalEntity')  // TODO: maybe implement this

    await this.hydrate()

    utils.throwUnless(this.typeVersionConfig.hasChildren, `TemporalEntity of type ${this.type} does not support children`)

    let children
    if (this.current?.meta?.children) children = structuredClone(this.current.meta.children)
    else children = {}
    children[childID] = true

    const metaDelta = {
      userID,
      validFrom,
      children,
    }
    if (impersonatorID) metaDelta.impersonatorID = impersonatorID
    this.patchMetaDelta(metaDelta)

    // Instantiate a new TemporalEntity using this.env and this.state and call patchAddParent on it
    console.log('childID: %s', childID)
    if (!dontPropogate) {
      const child = new this.constructor(this.state, this.env, undefined, undefined, childID)
      const childEntityMeta = await child.state.storage.get(`${childID}/entityMeta`)
      utils.throwUnless(childEntityMeta?.timeline?.length > 0, `${childID} TemporalEntity not found`, 404)
      child.patchAddParent({ addParent: { parentID: this.idString, dontPropogate: true }, userID, validFrom, impersonatorID })
    }

    return this.current
  }

  async patchAddParent({ addParent, userID, validFrom, impersonatorID }) {
    const { parentID, dontPropogate = false } = addParent
    utils.throwIf(utils.isIDString(parentID), 'Parent/child relationships across separate durable objects not yet supported by TemporalEntity')  // TODO: maybe implement this

    await this.hydrate()

    utils.throwUnless(this.typeVersionConfig.hasParents, `TemporalEntity of type ${this.type} does not support parents`)

    let parents
    if (this.current?.meta?.parents) parents = structuredClone(this.current.meta.parents)
    else parents = {}
    parents[parentID] = true

    const metaDelta = {
      userID,
      validFrom,
      parents,
    }
    if (impersonatorID) metaDelta.impersonatorID = impersonatorID
    this.patchMetaDelta(metaDelta)

    // Instantiate a new TemporalEntity using this.env and this.state and call patchAddChild on it
    console.log('parentID: %s', parentID)
    if (!dontPropogate) {
      const parent = new this.constructor(this.state, this.env, undefined, undefined, parentID)
      const parentEntityMeta = await parent.state.storage.get(`${parentID}/entityMeta`)
      utils.throwUnless(parentEntityMeta?.timeline?.length > 0, `${parentID} TemporalEntity not found`, 404)
      parent.patchAddChild({ addChild: { childID: this.idString, dontPropogate: true }, userID, validFrom, impersonatorID })
    }

    return this.current
  }

  // TODO: Upgrade to return DAG. Add back eTag support to save regenerating the DAG
  async getEntityMeta(eTag) {
    await this.hydrate()
    // Note, we don't check for deleted here because we want to be able to get the entityMeta even if the entity is deleted
    if (eTag && eTag === this.entityMeta.eTag) return [undefined, 304]
    return [this.entityMeta, 200]
  }

  async GETEntityMeta(request) {
    try {
      utils.throwIfAcceptHeaderInvalid(request)
      const eTag = utils.extractETag(request)
      const [entityMeta, status] = await this.getEntityMeta(eTag)
      if (status === 304) return this.getStatusOnlyResponse(304)
      return this.getResponse(entityMeta)
    } catch (e) {
      return this.getErrorResponse(e)
    }
  }
}
