/* eslint-disable no-param-reassign */  // safe because durable objects are airgapped so to speak

// 3rd party imports
import Debug from 'debug'

// local imports
import * as utils from './utils.js'
import responseMixin from './response-mixin.js'
import { TemporalEntity } from './temporal-entity.js'
import { TemporalEntityBase } from './temporal-entity-base.js'

// initialize imports
const debug = utils.getDebug('blueprint:tree')

/*

org-tree: {  // Tree
  entityMeta: {
    nodeCount: number,  // start at 0
    userID: string,  // user who created the tree
    impersonatorID: string,  // user who created the tree if impersonating
    validFrom: string,  // The ISO string when the tree was created
    lastValidFrom: string,  // The ISO string when the tree/branches (not the nodes) were last modified
  }
}

org-tree-root-node: {  // TemporalEntity w/ org-tree-root-node type. Add a flag in TemporalEntity type for hasChildren
  value: {
    label: string,
    emailDomains: [string],
  },
  meta: { children: Set<string> },
}

org-tree-node: {  // TemporalEntity w/ org-tree-node type. Add a flag in TemporalEntity type for hasParents
  value: { label: string },
  meta: {
    children: Set<string>,
    parents: Set<string>,
  },
}

/tree/v1
  POST - creates a new tree with a root node

/tree/v1/[treeIDString]
  TODO B: GET - returns the DAG with just labels and children

/tree/v1/[treeIdString]/node/[nodeType]/[nodeVersion]/[nodeIDString]
  TODO B: GET, PUT, PATCH delta/undelete, and DELETE just like a TemporalEntity

/tree/v1/[treeIdString]/aggregate
  TODO B: POST - execute the aggregation. Starting nodeIDString in body or root if omitted. First version just gathers all matching nodes.

/tree/v1/[treeIdString]
  PATCH
    addNode - add a node to the tree. Body contains newNode and parentIDString.
    TODO A2: addBranch
      Add a branch to the tree. Body contains parentIDString and childIDString.
      Errors unless child type.hasParents.
      Errors unless parent type.hasChildren.
      Before anything is changed confirms that adding the branch won't create a cycle. If it does, returns ?409?.
    TODO A3: removeBranch
      Removes a branch from the tree. Body contains parentIDString and childIDString.
      If the childIDString is '0', then return early but don't error.
      Don't do any error checking because this is a no-op if the branch doesn't exist.
      If the child TE only has that one parent, remove it anyway. You can figure out the orphaned ids by
      crawling the tree from the root. Any unused numbers between 0 and nodeCound are orphans.
    TODO A4: moveNode
      Moves a branch from one parent to another. Body contains parentIDString, childIDString, and newParentIDString.
      Start with addBranch which has error checking. If that succeeds, removeBranch which has no error checking.

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

    // hydrate #entityMeta
    const defaultEntityMeta = {
      nodeCount: 0,
      // lastValidFrom: null,  // The fields on this line and below are not populated until after the first operation. They are here but commented out for documentation. Fields above this line are required upon instantiation.
      // validFrom: null,
      // userID: null,
      // eTag: null,
    }
    this.entityMeta = await this.state.storage.get(`${this.idString}/entityMeta`) || defaultEntityMeta

    this.hydrated = true
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

      const version = pathArray.shift()
      utils.throwUnless(version === 'v1', `Unrecognized version ${version}`, 404)

      if (utils.isIDString(pathArray[0])) {
        this.idString = pathArray.shift()  // remove the ID
      } else {
        this.idString = this.state?.id?.toString()
        this.nextStatus = 201  // This means that the entity was created on this PUT or POST
      }

      let restOfPath
      if (pathArray[0] === 'node') {
        pathArray.shift()  // remove "node"
        restOfPath = `/${pathArray.join('/')}`
        pathArray.shift()  // remove the nodeType
        pathArray.shift()  // remove the nodeVersion
        const nodeIDString = pathArray.shift()
        const nodeTE = new TemporalEntity(this.state, this.env, undefined, undefined, nodeIDString)
        return nodeTE.fetch(request, restOfPath)
      }

      restOfPath = `/${pathArray.join('/')}`
      switch (restOfPath) {
        case '/':
          if (this[request.method]) return this[request.method](request)
          return utils.throwIf(true, `Unrecognized HTTP method ${request.method} for ${url.pathname}`, 405)

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

    utils.throwUnless(this.entityMeta.nodeCount === 0, `POST can only be called once but nodeCount is ${this.entityMeta.nodeCount}`)

    // Set validFrom and validFromDate
    validFrom = this.deriveValidFrom(validFrom).validFrom

    // Create root node
    const rootNodeTE = new TemporalEntity(this.state, this.env, type, version, this.entityMeta.nodeCount.toString())
    await rootNodeTE.put(value, userID, validFrom, impersonatorID)

    // If the root node creation works, then update entityMeta
    this.entityMeta.nodeCount++
    this.entityMeta.userID = userID
    this.entityMeta.validFrom = validFrom
    this.entityMeta.lastValidFrom = validFrom
    this.entityMeta.eTag = utils.getUUID(this.env)
    if (impersonatorID) this.entityMeta.impersonatorID = impersonatorID
    await this.state.storage.put(`${this.idString}/entityMeta`, this.entityMeta)

    const responseFromGet = await this.get()
    return [responseFromGet[0], 201]
  }

  async POST(request) {
    try {
      utils.throwIfMediaTypeHeaderInvalid(request)
      const options = await utils.decodeCBORSC(request)
      const [entityMeta, status] = await this.post(options)
      return this.getResponse(entityMeta, status)
    } catch (e) {
      return this.getErrorResponse(e)
    }
  }

  async patchAddNode({ addNode, userID, validFrom, impersonatorID }) {
    const { newNode, parentID } = addNode
    const parentIDNumber = Number(parentID)
    utils.throwIf(
      Number.isNaN(parentIDNumber) || parentIDNumber < 0 || parentIDNumber > this.entityMeta.nodeCount,
      `${parentID} TemporalEntity not found`,
      404,
    )
    const { value, type, version } = newNode
    utils.throwUnless(value && type && version, 'body.node with value, type, and version required when Tree PATCH addNode is called')
    utils.throwUnless(userID, 'userID required by Tree operation is missing')
    // TODO: throw unless the new node type allows for parents and children

    await this.hydrate()

    validFrom = this.deriveValidFrom(validFrom).validFrom

    // Create the new node
    const nodeTE = new TemporalEntity(this.state, this.env, type, version, this.entityMeta.nodeCount.toString())
    await nodeTE.put(value, userID, validFrom, impersonatorID)

    await this.patchAddBranch({ addBranch: { parent: parentID, child: nodeTE }, userID, validFrom, impersonatorID })

    // Update entityMeta
    this.entityMeta.nodeCount++
    this.entityMeta.lastValidFrom = validFrom
    this.entityMeta.eTag = utils.getUUID(this.env)
    await this.state.storage.put(`${this.idString}/entityMeta`, this.entityMeta)

    const responseFromGet = await this.get()
    return [responseFromGet[0], 201]
  }

  /**
   *
   * # addBranch
   *
   * Adds a branch to the tree mutating the children and parents fields of the parent and child respectively.
   *
   * Accepts either TemporalEntity instances or IDs for parent or child.
   * If an ID is passed in rather than a TemporalEntity instance, it uses TemporalEntity.patchMetaDelta() which creates a new snapshot.
   * If a TemporalEntity instance is passed in, it mutates the current value in place and does not create a new snapshot under the assumption
   * that if you already had a TemporalEnity instance, you probably already made a change and you want this branch change to be atomic with
   * that.
   */
  async patchAddBranch({ addBranch, userID, validFrom, impersonatorID }) {
    // TODO: Call this from patchAddNode
    const { parent, child } = addBranch

    let parentIDString
    if (typeof parent === 'string' || parent instanceof String) {
      parentIDString = parent
    } else if (parent instanceof TemporalEntityBase) {
      parentIDString = parent.idString
    } else {
      utils.throwIf(true, 'parent must be a string or a TemporalEntity')
    }

    let childIDString
    if (typeof child === 'string' || child instanceof String) {
      childIDString = child
    } else if (child instanceof TemporalEntityBase) {
      childIDString = child.idString
    } else {
      utils.throwIf(true, 'child must be a string or a TemporalEntity')
    }

    await Promise.all([
      this.addToSetInEntityMeta('parents', child, parentIDString, userID, validFrom, impersonatorID),
      this.addToSetInEntityMeta('children', parent, childIDString, userID, validFrom, impersonatorID),
    ])

    // TODO: return something maybe?
  }

  async addToSetInEntityMeta(metaFieldToAddTo, temporalEntityOrIDString, valueToAdd, userID, validFrom, impersonatorID) {
    let idString
    let nodeTE
    if (typeof temporalEntityOrIDString === 'string' || temporalEntityOrIDString instanceof String) {  // so update by creating a new snapshot
      idString = temporalEntityOrIDString
      nodeTE = new TemporalEntity(this.state, this.env, undefined, undefined, idString)
      await nodeTE.hydrate()
      const set = structuredClone(nodeTE.current.meta[metaFieldToAddTo]) || new Set()
      set.add(valueToAdd)
      const delta = { validFrom, userID }
      if (impersonatorID) delta.impersonatorID = impersonatorID
      delta[metaFieldToAddTo] = set
      nodeTE.patchMetaDelta(delta)  // creates a new snapshot
    } else if (temporalEntityOrIDString instanceof TemporalEntityBase) {  // update in place without creating a new snapshot
      nodeTE = temporalEntityOrIDString
      nodeTE.current.meta[metaFieldToAddTo] ??= new Set()
      nodeTE.current.meta[metaFieldToAddTo].add(valueToAdd)
      await nodeTE.state.storage.put(`${nodeTE.idString}/snapshot/${nodeTE.current.meta.validFrom}`, nodeTE.current)
    } else {
      utils.throwIf(true, `${metaFieldToAddTo === 'children' ? 'parent' : 'child'} must be a string or a TemporalEntity`)
    }
  }

  async patch(options) {
    utils.throwUnless(options.userID, 'userID required by TemporalEntity PATCH is missing')

    if (options.addNode) return this.patchAddNode(options)
    if (options.addBranch) return this.patchAddBranch(options)  // does not use eTag because it's idempotent
    if (options.removeBranch) return this.patchRemoveBranch(options)  // does not use eTag because it fails silently

    return utils.throwIf(
      true,
      'Malformed PATCH on Tree. Body must include valid operation: addNode, addBranch, removeBranch, etc.',
      400,
    )
  }

  async PATCH(request) {
    try {
      utils.throwIfMediaTypeHeaderInvalid(request)
      const options = await utils.decodeCBORSC(request)
      const eTag = utils.extractETag(request)
      const [entityMeta, status] = await this.patch(options, eTag)
      return this.getResponse(entityMeta, status)
    } catch (e) {
      return this.getErrorResponse(e)  // TODO: add e2e test for the body of the response
    }
  }

  async get(eTag) {
    await this.hydrate()
    // Note, we don't check for deleted here because we want to be able to get the entityMeta even if the entity is deleted
    if (eTag && eTag === this.entityMeta.eTag) return [undefined, 304]
    const tree = {}  // TODO: Build the tree
    const response = { meta: this.entityMeta, tree }
    return [response, 200]
  }

  async GET(request) {
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
