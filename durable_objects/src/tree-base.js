/* eslint-disable no-param-reassign */  // safe because durable objects are airgapped so to speak
// file deepcode ignore AttrAccessOnNull: Everytime I see this, I think it's a false positive
// file deepcode ignore StaticAccessThis: I disagree with the rule. Repeating the class name is not DRY.

// monorepo imports
import {
  responseMixin, throwIf, throwUnless, isIDString, throwIfMediaTypeHeaderInvalid,
  throwIfAcceptHeaderInvalid, extractBody, getDebug, Debug, dateISOStringRegex, contentProcessors,
} from '@transformation-dev/cloudflare-do-utils'

// local imports
import { TemporalEntityBase } from './temporal-entity-base'
import { temporalMixin } from './temporal-mixin'

// initialize imports
const debug = getDebug('blueprint:tree')

const DEFAULT_CONTENT_TYPE = 'application/cbor-sc'
const DEFAULT_HEADERS = {
  'Content-Type': DEFAULT_CONTENT_TYPE,
  Accept: DEFAULT_CONTENT_TYPE,
}
const { serialize, deserialize } = contentProcessors[DEFAULT_CONTENT_TYPE]  // TODO: Don't use these directly. Rather use the exported functions: requestIn, responseOut, etc.

/*

/tree/v1
  POST - creates a new tree with a root node

/tree/v1/[treeIDString]
  GET - returns the DAG with just labels and children
  PATCH
    addNode - Adds a node to the tree
      body.addNode contains newNode and parent fields
    addBranch - Adds a branch
      body contains parent and child fields. Strings or numbers are accepted.
    deleteBranch - Deletes a branch
      body contains parent and child fields. Strings or numbers are accepted.
    moveBranch - Moves a branch from one parent to another.
      body contains parent, child, and newParent fields. Strings or numbers are accepted.
      Start with addBranch which has error checking. If that succeeds, removeBranch which has no error checking.

/tree/v1/[treeIdString]/aggregate
  TODO B: POST - execute the aggregation. Starting nodeIDString in body or root if omitted. First version just gathers all matching nodes.

TODO: Use Cloudflare queues to communicate changes to node TemporalEntities to the Tree instance

TODO: Refactor so all methods use destructuring on options/body for parameters
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
export class TreeBase  {
  // using base class constructor

  // TODO: upgrade VersioningTransactionalDOWrapper to not always eject from memory on errors. Not sure how to decide.

  // <NodeStub> = {
  //   label: string,  // denormalized from the node itself
  //   idString: string  // idString for the DO that holds the actual node
  // }
  // <Nodes> = {
  //   <id: string>: <NodeStub>,  // this id comes from incrementing nodeCount
  // }
  // <Edges> = {  // use for both edges and reverseEdges
  //   <id: string>: [<id: string>],
  // }

  constructor(state, env, idString) {  // idString is only used in unit tests and composition. Cloudflare only passes in two parameters.
    Debug.enable(env.DEBUG)
    this.debug = debug
    this.state = state
    this.env = env
    if (idString === 0) this.idString = '0'
    else if (idString != null) this.idString = idString.toString()
    else this.idString = undefined

    Object.assign(this, responseMixin)
    Object.assign(this, temporalMixin)

    this.hydrated = false  // using this.hydrated for lazy load rather than this.state.blockConcurrencyWhile(this.hydrate.bind(this))
  }

  // Utilities

  async hydrate() {
    debug('hydrate() called. this.hydrated: %O', this.hydrated)
    if (this.hydrated) return

    // validation
    throwUnless(this.idString, 'Entity id is required', 404)

    // hydrate #entityMeta
    const defaultEntityMeta = {
      timeline: [],
      nodeCount: 0,
    }
    this.entityMeta = await this.state.storage.get(`${this.idString}/entityMeta`) || defaultEntityMeta

    // hydrate instance data
    this.current = {}
    if (this.entityMeta.timeline.length > 0) {
      this.nodes = await this.state.storage.get(`${this.idString}/snapshot/${this.entityMeta.timeline.at(-1)}/nodes`)
      this.edges = await this.state.storage.get(`${this.idString}/snapshot/${this.entityMeta.timeline.at(-1)}/edges`)
    }
    this.invalidateDerived()
    this.hydrated = true
  }

  invalidateDerived() {
    this.reverseEdges = null
    this.tree = null
  }

  deriveReverseEdges() {  // This is the first function after 6 months of using GitHub Copilot that was auto-created without any edits
    if (this.reverseEdges != null) return
    this.reverseEdges = {}
    for (const [parentID, children] of Object.entries(this.edges)) {
      for (const childID of children) {
        if (this.reverseEdges[childID] == null) this.reverseEdges[childID] = []
        this.reverseEdges[childID].push(parentID)
      }
    }
  }

  isChildOf(parentID, childID) {  // is childID (2nd parameter) a child of parentID (1st parameter)?
    return this.edges?.[parentID]?.includes(childID)
  }

  isParentOf(childID, parentID) {  // is parentID (2nd parameter) a parent of childID (1st parameter)?
    this.deriveReverseEdges()
    return this.reverseEdges[childID]?.includes(parentID) ?? false
  }

  async throwIfInvalidID(id) {
    await this.hydrate()
    const parentIDNumber = Number(id)
    throwIf(
      Number.isNaN(parentIDNumber) || parentIDNumber < 0 || parentIDNumber > this.entityMeta.nodeCount,
      `${id} not found`,
      404,
    )
  }

  recurseThrowIfIDInAncestry(parent, child, pathFromAncestorToChild) {
    pathFromAncestorToChild.unshift(parent)
    throwIf(pathFromAncestorToChild[0] === pathFromAncestorToChild.at(-1), `Adding this branch would create a cycle: ${pathFromAncestorToChild.join(' -> ')}`, 409)
    if (parent !== '0') {
      for (const p of this.reverseEdges[parent]) {
        this.recurseThrowIfIDInAncestry(p, child, pathFromAncestorToChild)
      }
    }
    return true
  }

  async throwIfIDInAncestry(parent, child, pathFromAncestorToChild = []) {
    await this.hydrate()
    this.deriveReverseEdges()
    parent = parent.toString()
    child = child.toString()
    pathFromAncestorToChild.push(child)
    return this.recurseThrowIfIDInAncestry(parent, child, pathFromAncestorToChild)
  }

  async callNodeDO(nodeType, nodeVersion, options, expectedResponseCode, idString) {
    options.body = await serialize(options.body)
    options.headers = { ...DEFAULT_HEADERS, ...options.headers }
    let id
    let url = `http://fake.host/${nodeType}/${nodeVersion}/`
    if (idString == null) {
      id = this.env[this.constructor.doNameString].newUniqueId()
    } else {
      id = this.env[this.constructor.doNameString].idFromString(idString)
      url += `${idString}/`
    }
    const entityStub = this.env[this.constructor.doNameString].get(id)
    const response = await entityStub.fetch(url, options)  // TODO: Pass along the cookies
    response.bodyObject = await deserialize(response)
    if (expectedResponseCode != null) {
      const { error } = response.bodyObject
      throwIf(
        response.status !== expectedResponseCode,
        error?.message || `Unexpected response code ${response.status} from call to ${url}`,
        response.status,
        response.bodyObject,
      )
    }
    return response
  }

  async save() {  // TODO: Upgrade this to support a large number of nodes once we have a customer getting close to that limit. Determine the limit now with testing.
    debug('save() called')
    this.state.storage.put(`${this.idString}/entityMeta`, this.entityMeta)
    this.state.storage.put(`${this.idString}/snapshot/${this.entityMeta.timeline.at(-1)}/nodes`, this.nodes)
    this.state.storage.put(`${this.idString}/snapshot/${this.entityMeta.timeline.at(-1)}/edges`, this.edges)
  }

  async updateMetaAndSave(validFrom, userID, impersonatorID, incrementNodeCount = false) {  // You must update current.nodes or current.edges before calling this.
    debug('updateMetaAndSave() called')
    throwUnless(this.hydrated, 'updateMetaAndSave() called before hydrate()')
    this.current.meta = {
      validFrom,
      validTo: TemporalEntityBase.END_OF_TIME,
      userID,
      type: 'tree',
      version: 'v1',  // TODO: For now, there is only one version of tree, but if there later is a v2, this will need to be changed
      // We don't maintain previousValues for the tree itself, but we do for the nodes
    }
    if (impersonatorID != null) this.current.meta.impersonatorID = impersonatorID
    this.entityMeta.timeline.push(validFrom)
    if (incrementNodeCount) this.entityMeta.nodeCount++
    return this.save()
  }

  async hardDeleteDO(idString) {  // TODO: Move this to cloudflare-do-utils if we can make it generic enough
    debug('hardDeleteDO() called. idString: %s', idString)
    throwIf(idString == null, 'Required parameter, idString, missing from call to hardDeleteDO()')
    const options = {
      method: 'DELETE',
    }
    options.headers = { Accept: DEFAULT_CONTENT_TYPE }
    const url = `http://fake.host/transactional-do-wrapper/${idString}`
    const id = this.env[this.constructor.doNameString].idFromString(idString)
    const entityStub = this.env[this.constructor.doNameString].get(id)
    const response = await entityStub.fetch(url, options)  // TODO: Pass along the cookies
    response.bodyObject = await deserialize(response)
    if (response.status >= 400) {
      const { error } = response.bodyObject
      throwIf(
        true,
        error?.message || `Unexpected response code ${response.status} from call to ${url}`,
        response.status,
        response.bodyObject,
      )
    }
    return response
  }

  // Optimistic concurrency check. If the last validFrom is not the same as before the check, delete the Node DO and throw an error.
  async rollbackDOCreateAndThrowIfConcurrencyCheckFails(lastValidFrom, idString) {
    if (this.entityMeta.timeline?.at(-1) !== lastValidFrom) {  // This should work for both tree/root node creation as well as later node creation
      if (idString != null) {
        this.hardDeleteDO(idString)
      }
      throwIf(true, 'Optimistic concurrency check failed. Retry', 409)
    }
    return true
  }

  static separateTreeAndDeleted(
    nodes,
    edges,
    idNumString = '0',
    tree = {},
    alreadyVisited = {},
    deleted = { id: 'deleted', label: 'Deleted' },
    inDeletedBranch = false,
  ) {
    const node = nodes[idNumString]
    if (!inDeletedBranch) delete nodes[idNumString]  // Checking inDeletedBranch here assures that descendants of deleted nodes that aren't also descendants of an undeleted node will show up in orphaned
    tree.id = node.nodeIDString
    tree.label = node.label
    const childrenArrayOfNumStrings = edges[idNumString]
    if (childrenArrayOfNumStrings != null && childrenArrayOfNumStrings.length > 0) {
      for (const childIdString of childrenArrayOfNumStrings) {
        if (alreadyVisited[childIdString] != null) {
          if (alreadyVisited[childIdString].deleted) {
            deleted.children ??= []
            deleted.children.push(alreadyVisited[childIdString])
          } else {
            tree.children ??= []
            tree.children.push(alreadyVisited[childIdString])
          }
        } else {
          const newNode = {}
          if (nodes[childIdString]?.deleted) {
            deleted.children ??= []
            deleted.children.push(newNode)
            inDeletedBranch = true
          } else {
            tree.children ??= []
            tree.children.push(newNode)
          }
          alreadyVisited[childIdString] = newNode
          this.separateTreeAndDeleted(nodes, edges, childIdString, newNode, alreadyVisited, deleted, inDeletedBranch)
        }
      }
    }
    return { tree, deleted }
  }

  async deriveTree() {
    await this.hydrate()

    if (this.tree != null) return

    const nodesCopy = structuredClone(this.nodes)
    const { tree, deleted } = this.constructor.separateTreeAndDeleted(nodesCopy, this.edges)
    // populate orphaned from nodesCopy that is mutated by separateTreeDeletedAndOrphaned and attach to tree if not empty
    const nodesCopyKeys = Object.keys(nodesCopy)
    if (nodesCopyKeys.length > 0) {
      const orphaned = { id: 'orphaned', label: 'Orphaned' }
      // TODO: loop through nodesIndexKeys and add to orphaned

      tree.children ??= []
      tree.children.push(orphaned)
    }
    // attach deleted and orphaned to tree under the root node
    if (deleted.children?.length > 0) {
      tree.children ??= []
      tree.children.push(deleted)
    }
    this.tree = tree
  }

  // Fetch

  async fetch(request) {
    debug('fetch() called with %s %s', request.method, request.url)
    this.warnings = []
    try {
      const url = new URL(request.url)
      const pathArray = url.pathname.split('/').filter((s) => s !== '')

      const type = pathArray.shift()
      throwUnless(type === 'tree', `Unrecognized type ${type}`, 404)

      const version = pathArray.shift()
      throwUnless(version === 'v1', `Unrecognized version ${version}`, 404)

      if (isIDString(pathArray[0])) {
        this.idString = pathArray.shift()  // remove the ID
      } else {
        this.idString = this.state?.id?.toString()
      }

      const restOfPath = `/${pathArray.join('/')}`
      switch (restOfPath) {
        case '/':
          if (this[request.method] != null) return await this[request.method](request)
          return throwIf(true, `Unrecognized HTTP method ${request.method} for ${url.pathname}`, 405)

        case '/entity-meta':  // This doesn't require type or version but this.hydrate may in the future and this calls this.hydrate
          throwUnless(request.method === 'GET', `Unrecognized HTTP method ${request.method} for ${request.url}`, 405)
          return await this.GETEntityMeta(request)

        default:
          return throwIf(true, `Unrecognized URL ${url.pathname}`, 404)
      }
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate  TODO: Don't always do this
      this.invalidateDerived()
      return this.getErrorResponse(e)
    }
  }

  // Handlers

  async post({ rootNodeValue, userID, validFrom, impersonatorID }) {
    throwIf(rootNodeValue == null, 'valid body.rootNodeValue is required when Tree is created')
    throwUnless(userID, 'userID required by Tree operation is missing')

    await this.hydrate()

    throwUnless(this.entityMeta.nodeCount === 0, `POST to create tree can only be called once but nodeCount is ${this.entityMeta.nodeCount}`)

    this.invalidateDerived()

    validFrom = this.calculateValidFrom(validFrom).validFrom
    rootNodeValue.treeIDString = this.idString
    const options = {
      method: 'POST',
      body: { value: rootNodeValue, userID, validFrom, impersonatorID },
    }

    // TODO: wrap this in a try/catch block and retry if the optimistic concurrency check fails
    const lastValidFrom = this.entityMeta.timeline?.at(-1)
    // This next line is going to open the input gate, so we need an optimistic concurrency check. The above line is what we'll check against
    const response = await this.callNodeDO(this.constructor.rootNodeType, this.constructor.rootNodeVersion, options, 201)
    await this.rollbackDOCreateAndThrowIfConcurrencyCheckFails(lastValidFrom, response.bodyObject.idString)

    // Update current but not current.meta because that's done in updateMetaAndSave()
    validFrom = response.bodyObject.meta.validFrom  // in case it was changed by the Node DO
    this.nodes = {}
    this.edges = {}
    this.nodes[this.entityMeta.nodeCount] = { label: response.bodyObject.value.label, nodeIDString: response.bodyObject.idString }

    this.updateMetaAndSave(validFrom, userID, impersonatorID, true)

    return this.get({ statusToReturn: 201 })
  }

  async POST(request) {
    throwIfMediaTypeHeaderInvalid(request)
    const options = await extractBody(request)
    const [responseBody, status] = await this.post(options)
    return this.getResponse(responseBody, status)
  }

  async patchAddNode({ addNode, userID, validFrom, impersonatorID }) {
    const { value, parent } = addNode
    throwIf(value == null, '{ addNode: { value, parent }, userID, validFrom, impersonatorID } expected when Tree PATCH addNode is called')
    throwUnless(userID, 'userID required by Tree operation is missing')

    await this.hydrate()

    await this.throwIfInvalidID(parent)

    this.invalidateDerived()

    validFrom = this.calculateValidFrom(validFrom).validFrom

    value.treeIDString = this.idString
    const options = {
      method: 'POST',
      body: { value, userID, validFrom, impersonatorID },
    }

    // TODO: wrap this in a try/catch block and retry if the optimistic concurrency check fails
    const lastValidFrom = this.entityMeta.timeline?.at(-1)
    // This next line is going to open the input gate, so we need an optimistic concurrency check. The above line is what we'll check against
    const response = await this.callNodeDO(this.constructor.nodeType, this.constructor.nodeVersion, options, 201)
    await this.rollbackDOCreateAndThrowIfConcurrencyCheckFails(lastValidFrom, response.bodyObject.idString)

    // Update current but not current.meta because that's done in updateMetaAndSave()
    validFrom = response.bodyObject.meta.validFrom  // in case it was changed by the Node DO
    this.nodes[this.entityMeta.nodeCount] = { label: response.bodyObject.value.label, nodeIDString: response.bodyObject.idString }
    this.edges[parent] ??= []
    this.edges[parent].push(this.entityMeta.nodeCount.toString())

    this.updateMetaAndSave(validFrom, userID, impersonatorID, true)

    return this.get()
  }

  /**
   *
   * # patchAddBranch
   *
   * Adds a branch to the tree
   */
  async patchAddBranch({ addBranch, userID, validFrom, impersonatorID }) {
    let { parent, child } = addBranch
    parent = parent.toString()
    child = child.toString()
    throwUnless(parent != null && child != null, 'body.addBranch with parent and child required when Tree PATCH patchBranch is called')
    throwIf(parent === child, 'parent and child cannot be the same')

    await this.hydrate()

    await this.throwIfInvalidID(parent)
    await this.throwIfInvalidID(child)

    if (this.isChildOf(parent, child)) {  // return silently if branch already exists
      return this.get()
    }

    await this.throwIfIDInAncestry(parent, child)

    this.invalidateDerived()

    validFrom = this.calculateValidFrom(validFrom).validFrom

    // Update current but not current.meta because that's done in updateMetaAndSave()
    this.edges[parent] ??= []
    this.edges[parent].push(child)

    this.updateMetaAndSave(validFrom, userID, impersonatorID, false)

    return this.get()
  }

  /**
   *
   * # patchDeleteBranch
   *
   * Deletes a branch from the tree
   */
  async patchDeleteBranch({ deleteBranch, userID, validFrom, impersonatorID }) {
    let { parent, child } = deleteBranch
    parent = parent.toString()
    child = child.toString()
    throwUnless(parent != null && child != null, 'body.deleteBranch with parent and child required when Tree PATCH patchBranch is called')

    await this.hydrate()

    await this.throwIfInvalidID(parent)
    await this.throwIfInvalidID(child)

    if (!this.isChildOf(parent, child)) {  // return silently if branch does not exist
      return this.get()
    }

    this.invalidateDerived()

    validFrom = this.calculateValidFrom(validFrom).validFrom

    // Update current but not current.meta because that's done in updateMetaAndSave()
    this.edges[parent] = this.edges[parent].filter((id) => id !== child)

    this.updateMetaAndSave(validFrom, userID, impersonatorID, false)

    return this.get()
  }

  /**
   *
   * # patchMoveBranch
   *
   * Moves a branch from one place to another in the tree
   */
  async patchMoveBranch({ moveBranch, userID, validFrom, impersonatorID }) {
    let { child, currentParent, newParent } = moveBranch
    currentParent = currentParent.toString()
    newParent = newParent.toString()
    child = child.toString()

    throwIf(
      child == null || currentParent == null || newParent == null,
      'body.moveBranch with child, currentParent, and newParent required when Tree PATCH moveBranch is called',
    )

    await this.hydrate()

    await this.throwIfInvalidID(currentParent)
    await this.throwIfInvalidID(newParent)
    await this.throwIfInvalidID(child)

    await this.throwIfIDInAncestry(newParent, child)

    this.invalidateDerived()

    validFrom = this.calculateValidFrom(validFrom).validFrom

    // Update current but not current.meta because that's done in updateMetaAndSave()
    if (this.isChildOf(currentParent, child)) {
      this.edges[currentParent] = this.edges[currentParent].filter((id) => id !== child)
    }

    if (!this.isChildOf(newParent, child)) {
      this.edges[newParent] ??= []
      this.edges[newParent].push(child)
    }

    this.updateMetaAndSave(validFrom, userID, impersonatorID, false)

    return this.get()
  }

  // eslint-disable-next-line no-unused-vars
  async patch(options) {
    throwUnless(options.userID, 'userID required by TemporalEntity PATCH is missing')

    if (options.addNode != null) return this.patchAddNode(options)
    if (options.addBranch != null) return this.patchAddBranch(options)  // does not use If-Modified-Since because it's idempotent
    if (options.deleteBranch != null) return this.patchDeleteBranch(options)  // does not use If-Modified-Since because it's idempotent
    if (options.moveBranch != null) return this.patchMoveBranch(options)  // does not use If-Modified-Since because ???

    return throwIf(
      true,
      'Malformed PATCH on Tree. Body must include valid operation: addNode, branch, etc.',
      400,
    )
  }

  async PATCH(request) {
    throwIfMediaTypeHeaderInvalid(request)
    const options = await extractBody(request)
    const [responseBody, status] = await this.patch(options)
    return this.getResponse(responseBody, status)
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
    if (this.entityMeta.timeline.at(-1) <= ifModifiedSince) return [undefined, 304]
    await this.deriveTree()
    const result = {
      current: {
        meta: this.current.meta,
        tree: this.tree,
      },
    }
    return [result, statusToReturn]
  }
}
