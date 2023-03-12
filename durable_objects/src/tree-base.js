/* eslint-disable no-param-reassign */  // safe because durable objects are airgapped so to speak

// monorepo imports
import {
  responseMixin, throwIf, throwUnless, isIDString, getUUID, throwIfMediaTypeHeaderInvalid,
  throwIfAcceptHeaderInvalid, extractBody, getIDStringFromInput, extractETag, getDebug, Debug,
  FetchProcessor,
  HTTPError,
} from '@transformation-dev/cloudflare-do-utils'
import { TemporalEntityBase } from './temporal-entity-base'

// initialize imports
const debug = getDebug('blueprint:tree')

const DEFAULT_CONTENT_TYPE = 'application/cbor-sc'
const DEFAULT_HEADERS = {
  'Content-Type': DEFAULT_CONTENT_TYPE,
  Accept: DEFAULT_CONTENT_TYPE,
}
const { serialize, deserialize } = FetchProcessor.contentTypes[DEFAULT_CONTENT_TYPE]

/*

/tree/v1
  POST - creates a new tree with a root node

/tree/v1/[treeIDString]
  GET - returns the DAG with just labels and children
  PATCH
    addNode - Adds a node to the tree
      body.addNode contains newNode and parent fields
    branch - Adds or deletes a branch
      body.branch.operation can be 'add' or 'delete'. 'add' is the default.
      body contains parent and child fields. Strings or numbers are accepted.
    moveBranch - Moves a branch from one parent to another.
      body contains parent, child, and newParent fields. Strings or numbers are accepted.
      Start with addBranch which has error checking. If that succeeds, removeBranch which has no error checking.

/tree/v1/[treeIdString]/aggregate
  TODO B: POST - execute the aggregation. Starting nodeIDString in body or root if omitted. First version just gathers all matching nodes.

TODO: Don't allow the root node to be deleted

TODO: Make this TreeBase. Subclass it to define the rootNodeType, rootNodeVersion, nodeType, and nodeVersion.
      We need this to be able to create the DO nodes.
      Those schemas will need to have a field for the idString for the Tree it belongs to.
      One Tree for orgs, one for systems, etc.

TODO A0: Refactor to have the nodes be separate DOs.
      - Copy TemporalEntityBase contents to Tree and start editing
      - Use Cloudflare queues to communicate changes to node TemporalEntities to the Tree instance

TODO: Trap DELETE on nodes. Warn on deleting nodes with children. Rebuild the tree. I think it's OK to leave the children and parents fields as-is though.
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

  // TODO: upgrade TemporalEntityBase to move all state saving to a save() method
  //       override base class hydrate() and save() method
  //       save() will save this.nodeCount, this.current.nodes, and this.parentToChildrenEdges to storage
  //       hydrate() will restore those and generate this.childrenToParentEdges
  //       maybe we can live with the parent class way of saving/hydrating entityMeta

  // TODO: upgrade VersioningTransactionalDOWrapper to not always eject from memory on erros. Not sure how to decide.

  // <NodeStub> = {
  //   label: string,  // denormalized from the node itself
  //   idString: string  // idString for the DO that holds the actual node
  // }
  // <Nodes> = {
  //   <id: string>: <NodeStub>,  // this id comes from incrementing nodeCount
  // }
  // <Edges> = {  // use for both parentToChildrenEdges and childrenToParentEdges
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

    this.hydrated = false  // using this.hydrated for lazy load rather than this.state.blockConcurrencyWhile(this.hydrate.bind(this))
  }

  async hydrate() {
    debug('hydrate() called. this.hydrated: %O', this.hydrated)
    if (this.hydrated) return

    // validation
    throwUnless(this.idString, 'Entity id is required', 404)

    // hydrate #entityMeta
    this.entityMeta = await this.state.storage.get(`${this.idString}/entityMeta`) || { timeline: [], nodeCount: 0 }

    // hydrate instance data
    this.current = {}
    if (this.entityMeta.timeline.length > 0) {
      this.current.nodes = await this.state.storage.get(`${this.idString}/snapshot/${this.entityMeta.timeline.at(-1)}/nodes`)
      this.current.parentToChildrenEdges = await this.state.storage.get(`${this.idString}/snapshot/${this.entityMeta.timeline.at(-1)}/parentToChildrenEdges`)
      // this.childrenToParentEdges = await this.state.storage.get(`${this.idString}/snapshot/${this.entityMeta.timeline.at(-1)}/childrenToParentEdges`)
      // TODO: Build this.childrenToParentEdges from this.parentToChildrenEdges
    }

    this.hydrated = true
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

  deriveValidFrom(validFrom) {  // This is the one from TemporalEntityBase not old Tree
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

  isChildOf(parentID, childID) {
    console.log(this.nodeCount)
    // TODO: implement this
  }

  isParentOf(childID, parentID) {
    console.log(this.nodeCount)
    // TODO: implement this
  }

  throwIfIDInAncestry(parentID, childID, pathFromAncestorToChild = []) {
    console.log(this.nodeCount)
    // TODO: implement this
  }

  throwIfParentChildRelationshipIsInvalid(parentID, childID) {
    console.log(this.nodeCount)
    // TODO: implement this
  }

  async fetch(request) {
    debug('fetch() called with %s %s', request.method, request.url)
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
          if (this[request.method] != null) return this[request.method](request)
          return throwIf(true, `Unrecognized HTTP method ${request.method} for ${url.pathname}`, 405)

        default:
          return throwIf(true, `Unrecognized URL ${url.pathname}`, 404)
      }
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate  TODO: Don't always do this
      return this.getErrorResponse(e)
    }
  }

  async save() {
    debug('save() called')
    this.state.storage.put(`${this.idString}/entityMeta`, this.entityMeta)
    this.state.storage.put(`${this.idString}/snapshot/${this.entityMeta.timeline.at(-1)}/nodes`, this.current.nodes)
    this.state.storage.put(`${this.idString}/snapshot/${this.entityMeta.timeline.at(-1)}/parentToChildrenEdges`, this.current.parentToChildrenEdges)
    // await this.state.storage.put(`${this.idString}/snapshot/${this.entityMeta.timeline.at(-1)}/childrenToParentEdges`, this.childrenToParentEdges)
  }

  async updateMetaAndSave(validFrom, userID, impersonatorID) {
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
    this.entityMeta.nodeCount++
    this.entityMeta.timeline.push(validFrom)
    return this.save()
  }

  async hardDeleteDO(idString) {  // TODO: Move this to cloudflare-do-utils
    debug('hardDeleteDO() called. idString: %s', idString)
    throwIf(idString == null, 'Required parameter, idString missing from call to hardDeleteDO()')
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
  async rollbackDOCreateAndThrowIfConcurrencyCheckFails(lastValidFrom, idString, userID, impersonatorID) {
    // TODO: Change this to a hard delete instead of a soft delete. Will have to be done by VersioningTransactionalDOWrapper
    if (this.entityMeta.timeline?.at(-1) !== lastValidFrom) {  // This should work for both tree/root node creation as well as later node creation
      if (idString != null) {
        const options = {
          method: 'DELETE',
          body: { userID, impersonatorID },
        }
        await this.callNodeDO('root-org-tree-node', 'v1', options, 204, idString)
      }
      throwIf(true, 'Optimistic concurrency check failed. Retry', 409)
    }
    return true
  }

  async post({ rootNodeValue, userID, validFrom, impersonatorID }) {
    throwIf(rootNodeValue == null, 'valid body.rootNodeValue is required when Tree is created')
    throwUnless(userID, 'userID required by Tree operation is missing')

    await this.hydrate()

    throwUnless(this.entityMeta.nodeCount === 0, `POST to create tree can only be called once but nodeCount is ${this.entityMeta.nodeCount}`)

    validFrom = this.deriveValidFrom(validFrom).validFrom
    rootNodeValue.treeIDString = this.idString
    const options = {
      method: 'POST',
      body: { value: rootNodeValue, userID, validFrom, impersonatorID },
    }

    const lastValidFrom = this.entityMeta.timeline?.at(-1)
    // This next line is going to open the input gate, so we need an optimistic concurrency check. The above line is what we'll check against
    const response = await this.callNodeDO('root-org-tree-node', 'v1', options, 201)
    await this.rollbackDOCreateAndThrowIfConcurrencyCheckFails(lastValidFrom, response.bodyObject.idString, userID, impersonatorID)

    // Update current but not current.meta because that's done in updateMetaAndSave()
    validFrom = response.bodyObject.meta.validFrom  // in case it was changed by the Node DO
    this.current.nodes = {}
    this.current.parentToChildrenEdges = {}
    this.current.nodes[this.entityMeta.nodeCount] = { label: response.bodyObject.value.label, nodeIDString: response.bodyObject.idString }

    this.updateMetaAndSave(validFrom, userID, impersonatorID)

    const result = {
      entityMeta: this.entityMeta,
      current: {
        meta: this.current.meta,
        // tree: this.current.tree,
      },
    }
    return [result, 201]  // TODO: Change to return get()
  }

  async POST(request) {
    try {
      throwIfMediaTypeHeaderInvalid(request)
      const options = await extractBody(request)
      const [responseBody, status] = await this.post(options)
      return this.getResponse(responseBody, status)
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate
      return this.getErrorResponse(e)
    }
  }

  async patchAddNode({ addNode, userID, validFrom, impersonatorID }) {
    const { value, parent } = addNode
    throwIf(value == null, '{ addNode: { value, parent }, userID, validFrom, impersonatorID } expected when Tree PATCH addNode is called')
    throwUnless(userID, 'userID required by Tree operation is missing')

    await this.hydrate()

    const parentIDNumber = Number(parent)
    throwIf(
      Number.isNaN(parentIDNumber) || parentIDNumber < 0 || parentIDNumber > this.entityMeta.nodeCount,
      `${parent} TemporalEntity not found`,
      404,
    )

    validFrom = this.deriveValidFrom(validFrom).validFrom

    value.treeIDString = this.idString
    const options = {
      method: 'POST',
      body: { value, userID, validFrom, impersonatorID },
    }

    const lastValidFrom = this.entityMeta.timeline?.at(-1)
    // This next line is going to open the input gate, so we need an optimistic concurrency check. The above line is what we'll check against
    const response = await this.callNodeDO('org-tree-node', 'v1', options, 201)
    await this.rollbackDOCreateAndThrowIfConcurrencyCheckFails(lastValidFrom, response.bodyObject.idString, userID, impersonatorID)

    // Update current but not current.meta because that's done in updateMetaAndSave()
    validFrom = response.bodyObject.meta.validFrom  // in case it was changed by the Node DO
    this.current.nodes[this.entityMeta.nodeCount] = { label: response.bodyObject.value.label, nodeIDString: response.bodyObject.idString }
    this.current.parentToChildrenEdges[parent] ??= []
    this.current.parentToChildrenEdges[parent].push(this.entityMeta.nodeCount.toString())

    this.updateMetaAndSave(validFrom, userID, impersonatorID)

    const result = {
      entityMeta: this.entityMeta,
      current: {
        meta: this.current.meta,
        // tree: this.current.tree,
      },
    }
    return [result, 200]  // TODO: Change to return get()
  }

  /**
   *
   * # patchMoveBranch
   *
   * Moves a branch from one place in the tree to another.
   */
  async patchMoveBranch({ moveBranch, userID, validFrom, impersonatorID }) {
    let { child, currentParent, newParent } = moveBranch
    throwIf(
      child == null || currentParent == null || newParent == null,
      'body.moveBranch with node, currentParent, and newParent required when Tree PATCH moveBranch is called',
    )
    child = child.toString()
    currentParent = currentParent.toString()
    newParent = newParent.toString()
    this.throwIfParentChildRelationshipIsInvalid(currentParent, child)

    await this.hydrate()

    const isCurrentParentOf = this.isParentOf(child, currentParent)
    const isCurrentChildOf = this.isChildOf(currentParent, child)
    if (!isCurrentChildOf && !isCurrentParentOf) {  // return silently if branch doesn't exist
      return this.get()
    }
    this.throwIfParentChildRelationshipIsInvalid(currentParent, child)

    this.throwIfIDInAncestry(newParent, child)

    const isNewParentOf = this.isParentOf(child, newParent)
    const isNewChildOf = this.isChildOf(newParent, child)
    if (isNewChildOf && isNewParentOf) {  // return silently if branch already exists
      return this.get()
    }
    this.throwIfParentChildRelationshipIsInvalid(newParent, child)

    // remove old branch

    // add new branch

    // return [tree, 200]
  }

  /**
   *
   * # patchBranch
   *
   * Adds or deletes a branch to the tree
   */
  async patchBranch({ branch, userID, validFrom, impersonatorID }) {
    const { parent, child } = branch
    const { operation = 'add' } = branch
    const { options = {} } = branch
    throwUnless(['add', 'delete'].includes(operation), 'body.branch.operation must be "add" or "delete"')
    throwUnless(parent != null && child != null, 'body.branch with parent and child required when Tree PATCH patchBranch is called')
    throwIf(parent === child, 'parent and child cannot be the same')

    await this.hydrate()

    const isParentOf = this.isParentOf(child, parent)
    const isChildOf = this.isChildOf(parent, child)
    this.throwIfParentChildRelationshipIsInvalid(parent, child)

    if (operation === 'add') {
      this.throwIfIDInAncestry(parent, child)
      if (isChildOf && isParentOf) {  // return silently if branch already exists
        return this.get(undefined, options)
      }
    }

    if (operation === 'delete') {
      if (!isChildOf && !isParentOf) {  // return silently if branch doesn't exist
        return this.get(undefined, options)
      }
    }

    // add the branch

    // save()

    // return [tree, 200]
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

  async getKeyFields(options, nodeNum) {
    const nodeCurrent = this.current.nodes[nodeNum]
    const nodeKeyFields = {}
    nodeKeyFields.id = nodeNum.toString()
    nodeKeyFields.label = nodeCurrent.value.label
    nodeKeyFields.children = nodeCurrent.meta.children
    if (nodeCurrent.meta.deleted) nodeKeyFields.deleted = true
    return nodeKeyFields
  }

  static separateTreeDeletedAndOrphaned(
    nodesIndex,
    nodeIDString = '0',
    tree = {},
    alreadyVisited = {},
    deleted = { id: 'deleted', label: 'Deleted' },
    inDeletedBranch = false,
  ) {
    const nodeKeyFields = nodesIndex[nodeIDString]
    if (!inDeletedBranch) delete nodesIndex[nodeIDString]  // Checking inDeletedBranch here assures that descendants of deleted nodes that aren't also descendants of an undeleted node will shop up in orphaned
    tree.id = nodeKeyFields.id
    tree.label = nodeKeyFields.label
    const { children } = nodeKeyFields
    if (children != null && children.length > 0) {
      for (const childIdString of children) {
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
          if (nodesIndex[childIdString]?.deleted) {
            deleted.children ??= []
            deleted.children.push(newNode)
            inDeletedBranch = true
          } else {
            tree.children ??= []
            tree.children.push(newNode)
          }
          alreadyVisited[childIdString] = newNode
          // deepcode ignore StaticAccessThis: Mostly because I don't understand why it's complaining
          this.separateTreeDeletedAndOrphaned(nodesIndex, childIdString, newNode, alreadyVisited, deleted, inDeletedBranch)
        }
      }
    }
    return { tree, deleted }
  }

  async buildTree(options) {
    await this.hydrate()
    const promises = []
    for (let nodeNum = 0; nodeNum < this.treeMeta.nodeCount; nodeNum++) {
      promises.push(this.getKeyFields(options, nodeNum))
    }
    const arrayOfNodeKeyFields = await Promise.all(promises)
    const nodesIndex = {}
    while (arrayOfNodeKeyFields.length > 0) {
      const nodeKeyFields = arrayOfNodeKeyFields.pop()
      if (nodeKeyFields != null) nodesIndex[nodeKeyFields.id] = nodeKeyFields
    }

    const { tree, deleted } = this.constructor.separateTreeDeletedAndOrphaned(nodesIndex)
    // populate orphaned from nodesIndex that is mutated by separateTreeDeletedAndOrphaned and attach to tree if not empty
    const nodesIndexKeys = Object.keys(nodesIndex)
    if (nodesIndexKeys.length > 0) {
      const orphaned = { id: 'orphaned', label: 'Orphaned' }
      // loop through nodesIndexKeys and add to orphaned

      tree.children ??= []
      tree.children.push(orphaned)
    }
    // attach deleted and orphaned to tree under the root node
    if (deleted.children?.length > 0) {
      tree.children ??= []
      tree.children.push(deleted)
    }
    return tree
  }

  async get(ifModifiedSinceISOString, options, statusToReturn = 200) {
    if (options != null) {
      throwIf(options.asOf && !options?.includeTree, 'asOf requires includeTree')
      this.warnIf(
        options.asOf != null && ifModifiedSinceISOString != null,
        'You supplied both asOf and If-Modified-Since header. asOf takes precedence.',
      )
      options.asOfISOString = options?.asOf ? new Date(options.asOf).toISOString() : undefined
    } else {
      options = { includeTree: false }
    }
    await this.hydrate()
    if (ifModifiedSinceISOString != null && ifModifiedSinceISOString >= this.treeMeta.lastValidFrom) return [undefined, 304]
    const response = { meta: this.treeMeta }
    if (options?.includeTree) {
      const isoStringThatTakesPrecendence = options?.asOfISOString ?? ifModifiedSinceISOString
      if (this.treeMeta?.lastValidFrom <= isoStringThatTakesPrecendence) {
        const cachedGetResponse = await this.state.storage.get(`${this.idString}/cachedGetResponse`)
        if (cachedGetResponse != null && cachedGetResponse.meta.lastValidFrom === this.treeMeta.lastValidFrom) {
          cachedGetResponse.fromCache = true
          return [cachedGetResponse, 200]
        }
      }
      response.tree = await this.buildTree(options)
      this.state.storage.put(`${this.idString}/cachedGetResponse`, response)
      response.fromCache = false
    }
    return [response, statusToReturn]
  }

  async GET(request) {
    try {
      throwIfAcceptHeaderInvalid(request)
      const ifModifiedSince = request.headers.get('If-Modified-Since')
      const ifModifiedSinceISOString = ifModifiedSince ? new Date(ifModifiedSince).toISOString() : undefined
      const url = new URL(request.url)
      const options = {
        includeTree: url.searchParams.get('includeTree')?.toLowerCase() !== 'false',  // default is true
        asOf: url.searchParams.get('asOf'),
      }
      const [response, status] = await this.get(ifModifiedSinceISOString, options)
      if (status === 304) return this.getStatusOnlyResponse(304)
      return this.getResponse(response)
    } catch (e) {
      this.hydrated = false  // Makes sure the next call to this DO will rehydrate
      return this.getErrorResponse(e)
    }
  }
}
