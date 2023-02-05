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
  treeMeta: {  // TODO: Change this to treeMeta
    nodeCount: number,  // start at 0
    userID: string,  // user who created the tree
    impersonatorID: string,  // user who created the tree if impersonating
    validFrom: string,  // The ISO string when the tree was created
    lastValidFrom: string,  // The ISO string when the tree/branches (not the nodes) were last modified
  }
  tree: {
    index: { <nodeIDString>: <nodeStub> } where <nodeStub> is { label: string, children: Set(<nodeStub>) },
    orphans: Set(<nodeIDString>),
    root: <nodeStub>,
  },
}

org-tree-root-node: {  // TemporalEntity w/ org-tree-root-node type. Flag in TemporalEntity type for hasChildren
  value: {
    label: string,
    emailDomains: Set<string>,
  },
  meta: { children: Set<string> },
}

org-tree-node: {  // TemporalEntity w/ org-tree-node type. Flags in TemporalEntity type for hasChildren and hasParents
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
    addNode - Adds a node to the tree
      body.addNode contains newNode and parent fields
    branch - Adds or deletes a branch
      body.branch.operation must be 'add' or 'delete'
      body contains parent and child fields
      TODO A1: Test remove branch
      TODO A2: Before a branch is added confirm that it won't create a cycle. If it does, returns 409 - Conflict.
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

    utils.throwUnless(this.idString, 'Entity id is required', 404)

    const defaultTreeMeta = {
      nodeCount: 0,
      // lastValidFrom: null,  // The fields on this line and below are not populated until after the first operation. They are here but commented out for documentation. Fields above this line are required upon instantiation.
      // validFrom: null,
      // userID: null,
      // eTag: null,
    }
    this.treeMeta = await this.state.storage.get(`${this.idString}/treeMeta`) || defaultTreeMeta

    this.hydrated = true
  }

  deriveValidFrom(validFrom) {  // this is different from the one in TemporalEntity
    utils.throwUnless(this.hydrated, 'hydrate() must be called before deriveValidFrom()')
    let validFromDate
    if (validFrom) {
      utils.throwIf(this.treeMeta.lastValidFrom && validFrom <= this.treeMeta.lastValidFrom, 'the provided validFrom for a Tree update is not greater than the last validFrom')
      validFromDate = new Date(validFrom)
    } else {
      validFromDate = new Date()
      if (this.treeMeta?.lastValidFrom) {
        const lastValidFromDate = new Date(this.treeMeta.lastValidFrom)
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

  async throwIfIDInAncestry(parent, childIDString, pathFromAncestorToNewChild) {
    if (!(parent instanceof TemporalEntityBase)) {
      parent = new TemporalEntity(this.state, this.env, undefined, undefined, parent)
    }
    debug('throwIfIDInAncestry parentIDString: %O  childIDString: %O', parent.idString, childIDString)
    if (!pathFromAncestorToNewChild || pathFromAncestorToNewChild.length === 0) {
      pathFromAncestorToNewChild = [childIDString]
      utils.throwIf(parent.idString === childIDString, `Cannot create a branch from ${childIDString} to itself`, 409)
    }
    pathFromAncestorToNewChild.unshift(parent.idString)
    const response = await parent.get()
    const status = response[1]
    utils.throwIf(status !== 200, `Could not get parent ${parent.idString}`, status)
    const { parents } = response[0].meta
    if (status === 200 && parents && parents.size > 0) {
      for (const p of parents) {
        utils.throwIf(
          p === childIDString,
          `Adding this branch would create a cycle from ${p} down through path ${pathFromAncestorToNewChild}`,
          409,
        )
      }
      const results = []
      for (const p of parents) {
        results.push(this.throwIfIDInAncestry(p, childIDString, pathFromAncestorToNewChild))
      }
      await Promise.all(results)
    }
  }

  // The body and return is always a CBOR-SC object
  async fetch(request) {
    debug('%s %s', request.method, request.url)
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
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate
      return this.getErrorResponse(e)
    }
  }

  async post({ rootNode, userID, validFrom, impersonatorID }) {
    const { value, type, version } = rootNode
    utils.throwUnless(value && type && version, 'body.rootNode with value, type, and version required when Tree is create')
    utils.throwUnless(userID, 'userID required by Tree operation is missing')

    await this.hydrate()

    utils.throwUnless(this.treeMeta.nodeCount === 0, `POST can only be called once but nodeCount is ${this.treeMeta.nodeCount}`)

    // Set validFrom and validFromDate
    validFrom = this.deriveValidFrom(validFrom).validFrom

    // Create root node
    const rootNodeTE = new TemporalEntity(this.state, this.env, type, version, this.treeMeta.nodeCount.toString())
    await rootNodeTE.put(value, userID, validFrom, impersonatorID)

    // If the root node creation works, then update treeMeta
    this.treeMeta.nodeCount++
    this.treeMeta.userID = userID
    this.treeMeta.validFrom = validFrom
    this.treeMeta.lastValidFrom = validFrom
    this.treeMeta.eTag = utils.getUUID(this.env)
    if (impersonatorID) this.treeMeta.impersonatorID = impersonatorID
    await this.state.storage.put(`${this.idString}/treeMeta`, this.treeMeta)

    const responseFromGet = await this.get()
    return [responseFromGet[0], 201]
  }

  async POST(request) {
    try {
      utils.throwIfMediaTypeHeaderInvalid(request)
      const options = await utils.decodeCBORSC(request)
      const [treeMeta, status] = await this.post(options)
      return this.getResponse(treeMeta, status)
    } catch (e) {
      return this.getErrorResponse(e)
    }
  }

  async patchAddNode({ addNode, userID, validFrom, impersonatorID }) {
    const { newNode, parent } = addNode
    const { value, type, version } = newNode
    utils.throwUnless(value && type && version, 'body.node with value, type, and version required when Tree PATCH addNode is called')
    utils.throwUnless(userID, 'userID required by Tree operation is missing')
    // TODO: throw unless the new node type allows for parents and children

    await this.hydrate()

    const parentIDNumber = Number(parent)
    if (!Number.isNaN(parentIDNumber)) {
      utils.throwIf(  // TODO: add this check elsewhere
        parentIDNumber < 0 || parentIDNumber > this.treeMeta.nodeCount,
        `${parent} TemporalEntity not found`,
        404,
      )
    }

    validFrom = this.deriveValidFrom(validFrom).validFrom

    // Create the new node
    const nodeTE = new TemporalEntity(this.state, this.env, type, version, this.treeMeta.nodeCount.toString())
    await nodeTE.put(value, userID, validFrom, impersonatorID)

    await this.patchBranch({ branch: { parent, child: nodeTE }, userID, validFrom, impersonatorID })

    // Update treeMeta
    this.treeMeta.nodeCount++
    this.treeMeta.lastValidFrom = validFrom
    this.treeMeta.eTag = utils.getUUID(this.env)
    await this.state.storage.put(`${this.idString}/treeMeta`, this.treeMeta)

    const responseFromGet = await this.get()
    return [responseFromGet[0], 201]
  }

  /**
   *
   * # patchBranch
   *
   * Adds or deletes a branch to the tree mutating the children and parents fields of the parent and child respectively.
   *
   * Accepts either TemporalEntity instances or IDs for parent or child.
   * If an ID is passed in rather than a TemporalEntity instance, it uses TemporalEntity.patchMetaDelta() which creates a new snapshot.
   * If a TemporalEntity instance is passed in, it mutates the current value in place and does not create a new snapshot under the assumption
   * that if you already had a TemporalEnity instance, you probably already made a change and you want this branch change to be atomic with
   * that.
   */
  async patchBranch({ branch, userID, validFrom, impersonatorID }) {
    const { parent, child, operation } = branch
    utils.throwUnless(parent.toString() && child.toString(), 'body.branch with parent and child required when Tree PATCH patchBranch is called')
    if (operation) utils.throwUnless(['add', 'delete'].includes(operation), 'body.branch.operation must be "add" or "delete"')

    const [parentIDString, parentTemporalEntityOrIDString] = utils.getIDStringFromInput(parent)
    const [childIDString, childTemporalEntityOrIDString] = utils.getIDStringFromInput(child)

    utils.throwIf(parentIDString === childIDString, 'parent and child cannot be the same')
    await this.throwIfIDInAncestry(parentTemporalEntityOrIDString, childIDString)

    // TODO: Implement rollback so that if one of these fails, we aren't left in a mutant state
    const childTE = await this.addOrDeleteOnSetInEntityMeta('parents', childTemporalEntityOrIDString, parentIDString, userID, validFrom, impersonatorID, operation)
    const parentTE = await this.addOrDeleteOnSetInEntityMeta('children', parentTemporalEntityOrIDString, childIDString, userID, validFrom, impersonatorID, operation)

    return { childTE, parentTE }
  }

  async addOrDeleteOnSetInEntityMeta(metaFieldToAddTo, temporalEntityOrIDString, valueToAdd, userID, validFrom, impersonatorID, operation = 'add') {
    let idString
    let nodeTE
    if (typeof temporalEntityOrIDString === 'string' || temporalEntityOrIDString instanceof String) {  // so update by creating a new snapshot
      idString = temporalEntityOrIDString
      nodeTE = new TemporalEntity(this.state, this.env, undefined, undefined, idString)
      await nodeTE.hydrate()
      const set = structuredClone(nodeTE.current.meta[metaFieldToAddTo]) || new Set()
      set[operation](valueToAdd)
      const delta = { validFrom, userID }
      if (impersonatorID) delta.impersonatorID = impersonatorID
      delta[metaFieldToAddTo] = set
      await nodeTE.patchMetaDelta(delta)  // creates a new snapshot
    } else if (temporalEntityOrIDString instanceof TemporalEntityBase) {  // update in place without creating a new snapshot
      nodeTE = temporalEntityOrIDString
      nodeTE.current.meta[metaFieldToAddTo] ??= new Set()
      nodeTE.current.meta[metaFieldToAddTo][operation](valueToAdd)
      await nodeTE.state.storage.put(`${nodeTE.idString}/snapshot/${nodeTE.current.meta.validFrom}`, nodeTE.current)
    } else {
      utils.throwIf(true, `${metaFieldToAddTo === 'children' ? 'parent' : 'child'} must be a string or a TemporalEntity`)
    }

    return nodeTE
  }

  async patch(options, eTag) {
    utils.throwUnless(options.userID, 'userID required by TemporalEntity PATCH is missing')

    if (options.addNode) return this.patchAddNode(options)
    if (options.branch) return this.patchBranch(options)  // does not use eTag because it's idempotent

    return utils.throwIf(
      true,
      'Malformed PATCH on Tree. Body must include valid operation: addNode, branch, etc.',
      400,
    )
  }

  async PATCH(request) {
    try {
      utils.throwIfMediaTypeHeaderInvalid(request)
      const options = await utils.decodeCBORSC(request)
      const eTag = utils.extractETag(request)
      const [treeMeta, status] = await this.patch(options, eTag)
      return this.getResponse(treeMeta, status)
    } catch (e) {
      return this.getErrorResponse(e)
    }
  }

  async get(eTag) {
    await this.hydrate()
    // Note, we don't check for deleted here because we want to be able to get the treeMeta even if the entity is deleted
    if (eTag && eTag === this.treeMeta.eTag) return [undefined, 304]
    const tree = {}  // TODO: Build the tree
    const response = { meta: this.treeMeta, tree }
    return [response, 200]
  }

  async GET(request) {
    try {
      utils.throwIfAcceptHeaderInvalid(request)
      const eTag = utils.extractETag(request)
      const [response, status] = await this.get(eTag)
      if (status === 304) return this.getStatusOnlyResponse(304)
      return this.getResponse(response)
    } catch (e) {
      return this.getErrorResponse(e)
    }
  }
}
