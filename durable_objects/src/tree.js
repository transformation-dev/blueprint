/* eslint-disable no-param-reassign */  // safe because durable objects are airgapped so to speak

// monorepo imports
import {
  responseMixin, throwIf, throwUnless, isIDString, getUUID, throwIfMediaTypeHeaderInvalid,
  throwIfAcceptHeaderInvalid, deserialize, getIDStringFromInput, extractETag, getDebug, Debug,
} from '@transformation-dev/cloudflare-do-utils'

// local imports
import { TemporalEntity } from './temporal-entity.js'
import { TemporalEntityBase } from './temporal-entity-base.js'

// initialize imports
const debug = getDebug('blueprint:tree')

/*

TODO A0: Create a wrapper class that will ensure memory and storage state are always in sync and storage self-consistent.

    You can import many different classes into this wrapper, but it will choose which one it is upon creation and use
    that one for ever more. You have to deleteAll on the storage contents to reassign it to a different class but we can provide
    a method in the wrapper class to do that.

    The original purpose of this is to address a concurrency worry I had once I started to compose my DOs with reusable
    parts. For instance, Tree uses TemporalEntity in composition.

    It replaces state.storage with the trx from a transaction.

    It also implements optimistic concurrency.

    In the future, I may also figure out a way to use this to implement versioning of the class code itself as opposed
    to the entity schemas as is done in TemporalEntity. This could solve the worry I have about using the same DO class
    for preview and production. I could deply the preview versions along side the older versions of the classes and dynamically
    pick the right version based on the environment. Maybe even implement a compatibility date approach like Cloudflare's itself.

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
    if (status === 200 && parents != null && parents.size > 0) {
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
    debug('%s %s', request.method, request.url)
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
      const options = await deserialize(request)
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
    const { parent, child } = branch
    let { operation } = branch
    if (operation == null) operation = 'add'
    throwUnless(parent.toString() && child.toString(), 'body.branch with parent and child required when Tree PATCH patchBranch is called')
    if (operation != null) throwUnless(['add', 'delete'].includes(operation), 'body.branch.operation must be "add" or "delete"')

    const [parentIDString, parentTemporalEntityOrIDString, parentValidFrom] = getIDStringFromInput(parent)
    const [childIDString, childTemporalEntityOrIDString, childValidFrom] = getIDStringFromInput(child)
    if (parentValidFrom != null && parentValidFrom > validFrom) validFrom = parentValidFrom
    if (childValidFrom != null && childValidFrom > validFrom) validFrom = childValidFrom

    if (operation === 'add') {
      throwIf(parentIDString === childIDString, 'parent and child cannot be the same')
      await this.throwIfIDInAncestry(parentTemporalEntityOrIDString, childIDString)
    }

    // TODO A: Implement a proxy for storage that holds all writes in memory and then commits them at the end of the request or not if there is an error

    // The validFrom in the calls below is only a suggestion to the TE because it might need to increment it by a millisecond if the prior validFrom is the same
    // so we can't gaurantee they'll be exactly the same. However, in real world the chances they'll be different is much lower than here in unit
    // testing because there is going some lag associated with storage that you don't see with an in-memory store used in testing.
    // Besides, we can live with them being a millisecond off in real world usage because the chances of the two validFrom values being on different
    // sides of a tick boundary is also very low. Besides, the chances that both the children and parents relationships matter for a moment in time
    // calculation is also very low.
    // Very low probability ^ 3 = not worth worrying about.
    const childTE = await this.addOrDeleteOnSetInEntityMeta('parents', childTemporalEntityOrIDString, parentIDString, userID, validFrom, impersonatorID, operation)
    const parentTE = await this.addOrDeleteOnSetInEntityMeta('children', parentTemporalEntityOrIDString, childIDString, userID, validFrom, impersonatorID, operation)

    // TODO: If I ever get on a later version of miniflare that includes storage.delete, I can use the code below
    // if (childTE.current.meta.validFrom !== parentTE.current.meta.validFrom) {
    //   const newValidFrom = childTE.current.meta.validFrom > parentTE.current.meta.validFrom ? childTE.current.meta.validFrom : parentTE.current.meta.validFrom
    //   await this.constructor.updateValidFromWithoutSnapshot(childTE, newValidFrom)
    //   await this.constructor.updateValidFromWithoutSnapshot(parentTE, newValidFrom)
    // }
    return { childTE, parentTE }
  }

  // static async updateValidFromWithoutSnapshot(nodeTE, newValidFrom) {
  //   await nodeTE.state.storage.delete(`${nodeTE.idString}/snapshot/${nodeTE.current.meta.validFrom}`, nodeTE.current)
  //   await nodeTE.state.storage.put(`${nodeTE.idString}/snapshot/${newValidFrom}`, nodeTE.current)
  //   nodeTE.entityMeta.timeline.pop()
  //   nodeTE.entityMeta.timeline.push(newValidFrom)
  //   await nodeTE.state.storage.put(`${nodeTE.idString}/entityMeta`, nodeTE.entityMeta)
  // }

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
      if (impersonatorID != null) delta.impersonatorID = impersonatorID
      delta[metaFieldToAddTo] = set
      await nodeTE.patchMetaDelta(delta)  // creates a new snapshot
    } else if (temporalEntityOrIDString instanceof TemporalEntityBase) {  // update in place without creating a new snapshot
      nodeTE = temporalEntityOrIDString
      nodeTE.current.meta[metaFieldToAddTo] ??= new Set()
      nodeTE.current.meta[metaFieldToAddTo][operation](valueToAdd)
      await nodeTE.state.storage.put(`${nodeTE.idString}/snapshot/${nodeTE.current.meta.validFrom}`, nodeTE.current)
    } else {
      throwIf(true, `${metaFieldToAddTo === 'children' ? 'parent' : 'child'} must be a string or a TemporalEntity`)
    }

    return nodeTE
  }

  // eslint-disable-next-line no-unused-vars
  async patch(options, eTag) {  // Maybe we'll use eTag on some other patch operation?
    throwUnless(options.userID, 'userID required by TemporalEntity PATCH is missing')

    if (options.addNode != null) return this.patchAddNode(options)
    if (options.branch != null) return this.patchBranch(options)  // does not use eTag because it's idempotent

    return throwIf(
      true,
      'Malformed PATCH on Tree. Body must include valid operation: addNode, branch, etc.',
      400,
    )
  }

  async PATCH(request) {
    try {
      throwIfMediaTypeHeaderInvalid(request)
      const options = await deserialize(request)
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
