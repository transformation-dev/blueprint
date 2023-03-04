/* eslint-disable no-param-reassign */  // safe because durable objects are airgapped so to speak

// monorepo imports
import {
  responseMixin, throwIf, throwUnless, isIDString, getUUID, throwIfMediaTypeHeaderInvalid,
  throwIfAcceptHeaderInvalid, extractBody, getIDStringFromInput, extractETag, getDebug, Debug,
} from '@transformation-dev/cloudflare-do-utils'

// local imports
import { TemporalEntity } from './temporal-entity.js'
import { TemporalEntityBase } from './temporal-entity-base.js'

// initialize imports
const debug = getDebug('blueprint:tree')

/*

org-tree: {  // Tree
  treeMeta: {
    nodeCount: number,  // start at 0
    userID: string,  // user who created the tree
    impersonatorID: string,  // user who created the tree if impersonating
    validFrom: string,  // The ISO string when the tree was created
    lastValidFrom: string,  // The ISO string when the tree/branches (not the nodes) were last modified
  }
  tree: {
    index: { <nodeIDString>: <nodeStub> } where <nodeStub> is { id: string, label: string, children: Set(<nodeStub>) },
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
  TODO A: GET - returns the DAG with just labels and children
  PATCH
    addNode - Adds a node to the tree
      body.addNode contains newNode and parent fields
    branch - Adds or deletes a branch
      body.branch.operation can be 'add' or 'delete'. 'add' is the default.
      body contains parent and child fields. Strings or numbers are accepted.
    TODO A4: moveNode - Moves a branch from one parent to another.
      body contains parent, child, and newParent fields. Strings or numbers are accepted.
      Start with addBranch which has error checking. If that succeeds, removeBranch which has no error checking.

/tree/v1/[treeIdString]/node/[nodeType]/[nodeVersion]/[nodeIDString]
  TODO B: GET, PUT, PATCH delta/undelete, and DELETE just like a TemporalEntity

/tree/v1/[treeIdString]/aggregate
  TODO B: POST - execute the aggregation. Starting nodeIDString in body or root if omitted. First version just gathers all matching nodes.

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
  constructor(state, env, idString) {  // idString is only used in tests and composition. Cloudflare only passes in two parameters.
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

    throwUnless(this.idString, 'Entity id is required', 404)

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
    throwUnless(this.hydrated, 'hydrate() must be called before deriveValidFrom()')
    let validFromDate
    if (validFrom != null) {
      throwIf(this.treeMeta.lastValidFrom && validFrom <= this.treeMeta.lastValidFrom, 'the provided validFrom for a Tree update is not greater than the last validFrom')
      validFromDate = new Date(validFrom)
    } else {
      validFromDate = new Date()
      if (this.treeMeta?.lastValidFrom != null) {
        const lastValidFromDate = new Date(this.treeMeta.lastValidFrom)
        if (validFromDate <= lastValidFromDate) {
          validFromDate = new Date(lastValidFromDate.getTime() + 1)
        }
        validFrom = new Date(validFromDate).toISOString()
      } else {
        validFrom = validFromDate.toISOString()
      }
    }
    return { validFrom, validFromDate }
  }

  async throwIfIDInAncestry(parent, childIDString, pathFromAncestorToNewChild) {
    if (!(parent instanceof TemporalEntityBase)) {
      parent = new TemporalEntity(this.state, this.env, undefined, undefined, parent)
    }
    debug('throwIfIDInAncestry parentIDString: %O  childIDString: %O', parent.idString, childIDString)
    if (pathFromAncestorToNewChild == null || pathFromAncestorToNewChild.length === 0) {
      pathFromAncestorToNewChild = [childIDString]
      throwIf(parent.idString === childIDString, `Cannot create a branch from ${childIDString} to itself`, 409)
    }
    pathFromAncestorToNewChild.unshift(parent.idString)
    const response = await parent.get()
    const status = response[1]
    throwIf(status !== 200, `Could not get parent ${parent.idString}`, status)
    const { parents } = response[0].meta
    if (status === 200 && parents != null && parents.length > 0) {
      for (const p of parents) {
        throwIf(
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
    debug('fetch() called with %s %s', request.method, request.url)
    try {
      const url = new URL(request.url)
      const pathArray = url.pathname.split('/')
      if (pathArray[0] === '') pathArray.shift()  // remove the leading slash

      const type = pathArray.shift()
      throwUnless(type === 'tree', `Unrecognized type ${type}`, 404)

      const version = pathArray.shift()
      throwUnless(version === 'v1', `Unrecognized version ${version}`, 404)

      if (isIDString(pathArray[0])) {
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
          if (this[request.method] != null) return this[request.method](request)
          return throwIf(true, `Unrecognized HTTP method ${request.method} for ${url.pathname}`, 405)

        default:
          return throwIf(true, `Unrecognized URL ${url.pathname}`, 404)
      }
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate
      return this.getErrorResponse(e)
    }
  }

  async post({ rootNode, userID, validFrom, impersonatorID }) {
    const { value, type, version } = rootNode
    throwUnless(value && type && version, 'body.rootNode with value, type, and version required when Tree is create')
    throwUnless(userID, 'userID required by Tree operation is missing')

    await this.hydrate()

    throwUnless(this.treeMeta.nodeCount === 0, `POST can only be called once but nodeCount is ${this.treeMeta.nodeCount}`)

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
    this.treeMeta.eTag = getUUID(this.env)
    if (impersonatorID != null) this.treeMeta.impersonatorID = impersonatorID
    await this.state.storage.put(`${this.idString}/treeMeta`, this.treeMeta)

    const responseFromGet = await this.get()
    return [responseFromGet[0], 201]
  }

  async POST(request) {
    try {
      throwIfMediaTypeHeaderInvalid(request)
      const options = await extractBody(request)
      const [treeMeta, status] = await this.post(options)
      return this.getResponse(treeMeta, status)
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate
      return this.getErrorResponse(e)
    }
  }

  async patchAddNode({ addNode, userID, validFrom, impersonatorID }) {
    const { newNode, parent } = addNode
    const { value, type, version } = newNode
    throwUnless(value && type && version, 'body.node with value, type, and version required when Tree PATCH addNode is called')
    throwUnless(userID, 'userID required by Tree operation is missing')
    // TODO: throw unless the new node type allows for parents and children

    await this.hydrate()

    const parentIDNumber = Number(parent)
    if (!Number.isNaN(parentIDNumber)) {
      throwIf(  // TODO: add this check elsewhere
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
    this.treeMeta.eTag = getUUID(this.env)
    await this.state.storage.put(`${this.idString}/treeMeta`, this.treeMeta)

    const responseFromGet = await this.get()
    return [responseFromGet[0], 200]  // using 200 eventhough it is creating a new resource that can be accessed via its own url because this uses a PATCH operation. If we added the node with a POST, we would use 201
  }

  /**
   *
   * # patchMoveBranch
   *
   * Moves a branch from one place in the tree to another.
   *
   * Unlike patchBranch, this only accepts IDs for node, currentParent, and newParent
   */
  async patchMoveBranch({ moveBranch, userID, validFrom, impersonatorID }) {
    let { node, currentParent, newParent } = moveBranch
    throwIf(
      node == null || currentParent == null || newParent == null,
      'body.moveBranch with node, currentParent, and newParent required when Tree PATCH patchMoveBranch is called',
    )
    node = node.toString()
    currentParent = currentParent.toString()
    newParent = newParent.toString()
    throwIf(
      node === currentParent || node === newParent || currentParent === newParent,
      'node, currentParent, and newParent must all be different when Tree PATCH patchMoveBranch is called',
    )

    await this.hydrate()

    await this.throwIfIDInAncestry(newParent, node)

    // metaFieldToAlter, temporalEntityOrIDString, valueToAddOrDelete, userID, validFrom, impersonatorID, operation = 'add'
    const nodeTE = await this.addOrDeleteOnRelationshipInEntityMeta('parents', node, currentParent, userID, validFrom, impersonatorID, 'delete')
    await this.addOrDeleteOnRelationshipInEntityMeta('parents', nodeTE, newParent, userID, validFrom, impersonatorID, 'add')
    const currentParentTE = await this.addOrDeleteOnRelationshipInEntityMeta('children', currentParent, node, userID, validFrom, impersonatorID, 'delete')
    const newParentTE = await this.addOrDeleteOnRelationshipInEntityMeta('children', newParent, node, userID, validFrom, impersonatorID, 'add')

    // The validFrom in the calls above are only a suggestion to the TE because it might need to increment it by a millisecond if the prior validFrom is the same
    // The code below fixes that but is a bit of a hack.
    const validFromArray = [nodeTE, currentParentTE, newParentTE].map((te) => te.current.meta.validFrom)
    let newValidFrom = validFromArray[0]
    if (new Set(validFromArray).size > 1) {  // meaning they are not all the same
      validFromArray.sort()
      newValidFrom = validFromArray.at(-1)
      await this.constructor.updateValidFromWithoutSnapshot(nodeTE, newValidFrom)
      await this.constructor.updateValidFromWithoutSnapshot(currentParentTE, newValidFrom)
      await this.constructor.updateValidFromWithoutSnapshot(newParentTE, newValidFrom)
    }

    this.treeMeta.lastValidFrom = newValidFrom
    this.treeMeta.eTag = getUUID(this.env)
    await this.state.storage.put(`${this.idString}/treeMeta`, this.treeMeta)

    const responseFromGet = await this.get()
    return [responseFromGet[0], 200]
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
    const { parent, child } = branch
    const { operation = 'add' } = branch
    throwUnless(['add', 'delete'].includes(operation), 'body.branch.operation must be "add" or "delete"')
    throwUnless(parent != null && child != null, 'body.branch with parent and child required when Tree PATCH patchBranch is called')

    await this.hydrate()

    const [parentIDString, parentTemporalEntityOrIDString, parentValidFrom] = getIDStringFromInput(parent)
    const [childIDString, childTemporalEntityOrIDString, childValidFrom] = getIDStringFromInput(child)
    if (parentValidFrom != null && parentValidFrom > validFrom) validFrom = parentValidFrom
    if (childValidFrom != null && childValidFrom > validFrom) validFrom = childValidFrom

    if (operation === 'add') {
      throwIf(parentIDString === childIDString, 'parent and child cannot be the same')
      await this.throwIfIDInAncestry(parentTemporalEntityOrIDString, childIDString)
    }

    const childTE = await this.addOrDeleteOnRelationshipInEntityMeta('parents', childTemporalEntityOrIDString, parentIDString, userID, validFrom, impersonatorID, operation)
    const parentTE = await this.addOrDeleteOnRelationshipInEntityMeta('children', parentTemporalEntityOrIDString, childIDString, userID, validFrom, impersonatorID, operation)

    // TODO: Be sure to have similar code to below when deleting a branch or moving a branch. It's less DRY but have an explicit patchMoveBranch() method that doesn't call patchBranch() twice otherwise the code below might get called three times.
    // The validFrom in the calls above are only a suggestion to the TE because it might need to increment it by a millisecond if the prior validFrom is the same
    // The code below fixes that but is a bit of a hack.
    let newValidFrom = childTE.current.meta.validFrom
    if (childTE.current.meta.validFrom !== parentTE.current.meta.validFrom) {
      newValidFrom = childTE.current.meta.validFrom > parentTE.current.meta.validFrom ? childTE.current.meta.validFrom : parentTE.current.meta.validFrom
      await this.constructor.updateValidFromWithoutSnapshot(childTE, newValidFrom)
      await this.constructor.updateValidFromWithoutSnapshot(parentTE, newValidFrom)
    }

    this.treeMeta.lastValidFrom = newValidFrom
    this.treeMeta.eTag = getUUID(this.env)
    await this.state.storage.put(`${this.idString}/treeMeta`, this.treeMeta)

    const responseFromGet = await this.get()
    return [responseFromGet[0], 200]
  }

  static async updateValidFromWithoutSnapshot(nodeTE, newValidFrom) {
    await nodeTE.state.storage.delete(`${nodeTE.idString}/snapshot/${nodeTE.current.meta.validFrom}`)
    await nodeTE.state.storage.put(`${nodeTE.idString}/snapshot/${newValidFrom}`, nodeTE.current)
    nodeTE.entityMeta.timeline.pop()
    nodeTE.entityMeta.timeline.push(newValidFrom)
    await nodeTE.state.storage.put(`${nodeTE.idString}/entityMeta`, nodeTE.entityMeta)
  }

  async addOrDeleteOnRelationshipInEntityMeta(metaFieldToAlter, temporalEntityOrIDString, valueToAddOrDelete, userID, validFrom, impersonatorID, operation = 'add') {
    let idString
    let nodeTE
    if (typeof temporalEntityOrIDString === 'string' || temporalEntityOrIDString instanceof String) {  // so update by creating a new snapshot
      idString = temporalEntityOrIDString
      nodeTE = new TemporalEntity(this.state, this.env, undefined, undefined, idString)
      await nodeTE.hydrate()
      let a = structuredClone(nodeTE.current.meta[metaFieldToAlter]) || []
      if (operation === 'add') a.push(valueToAddOrDelete)
      else if (operation === 'delete') a = a.filter((v) => v !== valueToAddOrDelete)
      else throw new Error('Operation on call to addOrDeleteOnRelationshipInEntityMeta must be "add" or "delete"')
      const delta = { validFrom, userID }
      if (impersonatorID != null) delta.impersonatorID = impersonatorID
      delta[metaFieldToAlter] = a
      await nodeTE.patchMetaDelta(delta)  // creates a new snapshot
    } else if (temporalEntityOrIDString instanceof TemporalEntityBase) {  // update in place without creating a new snapshot
      nodeTE = temporalEntityOrIDString
      nodeTE.current.meta[metaFieldToAlter] ??= []
      if (operation === 'add') nodeTE.current.meta[metaFieldToAlter].push(valueToAddOrDelete)
      else if (operation === 'delete') nodeTE.current.meta[metaFieldToAlter] = nodeTE.current.meta[metaFieldToAlter].filter((v) => v !== valueToAddOrDelete)
      else throw new Error('Operation on call to addOrDeleteOnRelationshipInEntityMeta must be "add" or "delete"')
      await nodeTE.state.storage.put(`${nodeTE.idString}/snapshot/${nodeTE.current.meta.validFrom}`, nodeTE.current)
    } else {
      throwIf(true, `${metaFieldToAlter === 'children' ? 'parent' : 'child'} must be a string or a TemporalEntity`)
    }

    return nodeTE
  }

  // eslint-disable-next-line no-unused-vars
  async patch(options, eTag) {  // Maybe we'll use eTag on some other patch operation?
    throwUnless(options.userID, 'userID required by TemporalEntity PATCH is missing')

    if (options.addNode != null) return this.patchAddNode(options)
    if (options.branch != null) return this.patchBranch(options)  // does not use eTag because it's idempotent
    if (options.moveBranch != null) return this.patchMoveBranch(options)  // does not use eTag because ???

    return throwIf(
      true,
      'Malformed PATCH on Tree. Body must include valid operation: addNode, branch, etc.',
      400,
    )
  }

  async PATCH(request) {
    try {
      throwIfMediaTypeHeaderInvalid(request)
      const options = await extractBody(request)
      const eTag = extractETag(request)
      const [treeMeta, status] = await this.patch(options, eTag)
      return this.getResponse(treeMeta, status)
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate
      return this.getErrorResponse(e)
    }
  }

  async get(eTag) {
    await this.hydrate()
    // Note, we don't check for deleted here because we want to be able to get the treeMeta even if the entity is deleted
    if (eTag != null && eTag === this.treeMeta.eTag) return [undefined, 304]
    const tree = {}  // TODO: Build the tree
    const response = { meta: this.treeMeta, tree }
    return [response, 200]
  }

  async GET(request) {
    try {
      throwIfAcceptHeaderInvalid(request)
      const eTag = extractETag(request)
      const [response, status] = await this.get(eTag)
      if (status === 304) return this.getStatusOnlyResponse(304)
      return this.getResponse(response)
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate
      return this.getErrorResponse(e)
    }
  }
}
