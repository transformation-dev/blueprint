/* eslint-disable no-undef */

// 3rd party imports
// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect, assert } from 'vitest'

// monorepo imports
import { encodeFetchAndDecode, addCryptoToEnv } from '@transformation-dev/cloudflare-do-testing-utils'

// local imports
import { DurableAPI } from '../src/index.js'

// const describe = setupMiniflareIsolatedStorage()  // intentionally not using this describe because I don't want isolated storage between my it/test blocks
const env = getMiniflareBindings()
await addCryptoToEnv(env)
// env.DEBUG = 'blueprint:*'
// env.DEBUG = 'blueprint:tree'
env.DEBUG = 'nothing'

describe('A series of Tree operations', async () => {
  let baseUrl = 'http://fake.host'
  let state
  let stub  // if stub is left undefined, then fetch is used instead of stub.fetch
  if (process?.env?.VITEST_BASE_URL != null) {
    baseUrl = process.env.VITEST_BASE_URL
  } else {
    const id = env.DO_API.newUniqueId()
    state = await getMiniflareDurableObjectState(id)
    // stub = await env.DO_API.get(id)  // this is how Cloudflare suggests but doing it the way below allows vitest --coverage to work
    stub = new DurableAPI(state, env, id.toString())
  }
  const coreUrl = `${baseUrl}/tree/v1`
  let url = coreUrl

  it('should allow tree creation with POST', async () => {
    const rootNode = {
      value: { label: 'root (aka node0)' },
      type: '***test-has-children***',  // TODO: Use a real schema
      version: 'v1',
    }
    const options = {
      method: 'POST',
      // headers: { 'Content-Type': 'application/cbor-sc' },  // auto-inserted by encodeFetchAndDecode
      body: { rootNode, userID: 'userW' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)

    // expects/asserts to always run
    expect(response.status).toBe(201)
    const { meta, idString } = response.CBOR_SC
    expect(meta.nodeCount).to.be.a('number')
    expect(meta.nodeCount).to.eq(1)
    expect(meta.validFrom).to.be.a('string')
    assert(meta.validFrom === meta.lastValidFrom)
    assert(meta.validFrom <= new Date().toISOString())
    expect(meta.userID).to.eq('userW')
    expect(response.headers.get('ETag')).to.eq(meta.eTag)
    expect(response.headers.get('Content-ID')).to.eq(idString)
    expect(idString).to.be.a('string')
    url += `/${idString}`

    // storage operation expects/asserts to only run in miniflare (aka not live over http)
    if (process?.env?.VITEST_BASE_URL == null) {
      const value = await state.storage.get('0/entityMeta')
      expect(value.timeline.length).toBe(1)
    }
  })

  it('should allow node creation with PATCH', async () => {
    const newNode = {
      value: { label: 'node1' },
      type: '***test-has-children-and-parents***',
      version: 'v1',
    }
    const options = {
      method: 'PATCH',
      // headers: { 'Content-Type': 'application/cbor-sc' },  // auto-inserted by encodeFetchAndDecode
      body: { addNode: { newNode, parent: '0' }, userID: 'userX' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)
    expect(response.status).toBe(200)
    const { meta } = response.CBOR_SC
    const { lastValidFrom } = meta
    expect(meta.nodeCount).to.eq(2)
    assert(meta.validFrom <= meta.lastValidFrom)
    if (process?.env?.VITEST_BASE_URL == null) {
      const child = await state.storage.get(`1/snapshot/${lastValidFrom}`)
      assert(child.meta.parents.includes('0'))
      const root = await state.storage.get(`0/snapshot/${lastValidFrom}`)
      assert(root.meta.children.includes('1'))
    }
  })

  it('should respond with error when sent non-existent parent', async () => {
    const newNode = {
      value: { label: 'node2' },
      type: '***test-has-children-and-parents***',
      version: 'v1',
    }
    const options = {
      method: 'PATCH',
      // headers: { 'Content-Type': 'application/cbor-sc' },  // auto-inserted by encodeFetchAndDecode
      body: { addNode: { newNode, parent: '999' }, userID: 'userY' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)
    expect(response.status).toBe(404)
    expect(response.CBOR_SC.error.message).toMatch('TemporalEntity not found')
  })

  let lastValidFrom

  it('should allow addition of another node', async () => {
    const newNode2 = {
      value: { label: 'node2' },
      type: '***test-has-children-and-parents***',
      version: 'v1',
    }
    const options = {
      method: 'PATCH',
      body: { addNode: { newNode: newNode2, parent: 1 }, userID: 'userY' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)
    expect(response.status).toBe(200)
    const { meta } = response.CBOR_SC
    lastValidFrom = meta.lastValidFrom
    expect(meta.nodeCount).to.eq(3)
    assert(meta.validFrom <= meta.lastValidFrom)
    if (process?.env?.VITEST_BASE_URL == null) {
      const node2 = await state.storage.get(`2/snapshot/${lastValidFrom}`)
      assert(node2.meta.parents.includes('1'))
      expect(node2.meta.parents).to.have.lengthOf(1)
      const node1 = await state.storage.get(`1/snapshot/${lastValidFrom}`)
      assert(node1.meta.children.includes('2'))
      expect(node1.meta.children).to.have.lengthOf(1)
    }
  })

  it('should respond with error when adding a node that would create a cycle', async () => {
    const branch = {
      parent: 2,  // intentionally a Number to confirm that it's forgiving of this
      child: '1',
      operation: 'add',
    }
    const options = {
      method: 'PATCH',
      body: { branch, userID: 'userY' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)
    const { error } = response.CBOR_SC
    expect(response.status).toBe(409)
    expect(error.message).toMatch('Adding this branch would create a cycle')
    if (process?.env?.VITEST_BASE_URL == null) {
      const node2 = await state.storage.get(`2/snapshot/${lastValidFrom}`)
      const node1 = await state.storage.get(`1/snapshot/${lastValidFrom}`)
      expect(node2.meta.parents.length).toBe(1)
      expect(node1.meta.children.length).toBe(1)
      expect(node2.meta.children).toBeUndefined()
      expect(node1.meta.parents.length).toBe(1)
    }
  })

  it('should allow addition of a branch that creates a diamond-shaped DAG', async () => {
    const branch = {
      parent: 0,  // intentionally a Number to confirm that it's forgiving of this as a zero
      child: 2,
      // operation: 'add',  // testing default operation by commenting this out
    }
    const options = {
      method: 'PATCH',
      body: { branch, userID: 'userY' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)
    expect(response.status).toBe(200)
    const { meta } = response.CBOR_SC
    lastValidFrom = meta.lastValidFrom
    expect(meta.nodeCount).to.eq(3)
    assert(meta.validFrom <= meta.lastValidFrom)
    if (process?.env?.VITEST_BASE_URL == null) {
      const node2 = await state.storage.get(`2/snapshot/${lastValidFrom}`)
      const node0 = await state.storage.get(`0/snapshot/${lastValidFrom}`)
      assert(node2.meta.parents.includes('0'))
      expect(node2.meta.parents).to.have.lengthOf(2)
      assert(node0.meta.children.includes('2'))
      expect(node0.meta.children).to.have.lengthOf(2)
    }
  })

  const tree = {
    id: '0',
    label: 'root (aka node0)',
    children: [
      {
        id: '1',
        label: 'node1',
        children: [
          {
            id: '2',
            label: 'node2',
          },
        ],
      },
      {
        id: '2',
        label: 'node2',
      },
    ],
  }

  it('should return the tree outline with ?includeTree=true', async () => {
    const response = await encodeFetchAndDecode(`${url}?includeTree=true&asOf=${new Date().toISOString()}`, undefined, stub)
    // console.log('response.CBOR_SC.tree: %s: ', JSON.stringify(response.CBOR_SC.tree, null, 2))
    console.log('response.CBOR_SC: %O: ', response.CBOR_SC)
    expect(response.status).toBe(200)
    expect(response.CBOR_SC.fromCache).toBe(false)
    expect(response.CBOR_SC.tree).to.deep.eq(tree)
    // this next line confirms that node2 is only transmitted once eventhough it shows up twice in the tree
    expect(response.CBOR_SC.tree.children[0].children[0]).toBe(response.CBOR_SC.tree.children[1])
    if (process?.env?.VITEST_BASE_URL == null) {
      // console.log('list of nodes: %O: ', await state.storage.list())
    }
  })

  it('should use the cachedGetResponse on second call to GET', async () => {
    const response = await encodeFetchAndDecode(`${url}?includeTree=true&asOf=${new Date().toISOString()}`, undefined, stub)
    expect(response.CBOR_SC.fromCache).toBe(true)
    expect(response.CBOR_SC.tree).to.deep.eq(tree)
  })

  it.todo('should also work with text/yaml Content-Type', () => {
  })

  it.todo('should return error with application/json Content-Type', () => {
  })

  it('should be "fail silently" when you add the same branch again', async () => {
    // TODO: Confirm that we don't end up with the child or parent duplicated
    // It should probably not have new snapshots but maybe it's OK?
    const branch = {
      parent: 0,  // intentionally a Number to confirm that it's forgiving of this as a zero
      child: 2,
      // operation: 'add',  // testing default operation by commenting this out
    }
    const options = {
      method: 'PATCH',
      body: { branch, userID: 'userY' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)
    expect(response.status).toBe(200)
    const { meta } = response.CBOR_SC
    lastValidFrom = meta.lastValidFrom
    expect(meta.nodeCount).to.eq(3)
    assert(meta.validFrom <= meta.lastValidFrom)
    if (process?.env?.VITEST_BASE_URL == null) {
      const node2EntityMeta = await state.storage.get('2/entityMeta')
      const node2LastValidFrom = node2EntityMeta.timeline.at(-1)
      const node2 = await state.storage.get(`2/snapshot/${node2LastValidFrom}`)
      const node0EntityMeta = await state.storage.get('0/entityMeta')
      const node0LastValidFrom = node0EntityMeta.timeline.at(-1)
      const node0 = await state.storage.get(`0/snapshot/${node0LastValidFrom}`)
      assert(node2.meta.parents.includes('0'))
      expect(node2.meta.parents.length).toBe(2)
      assert(node0.meta.children.includes('2'))
      expect(node0.meta.children.length).toBe(2)
    }
  })

  it('should allow deletion of a branch', async () => {
    const branch = {
      parent: 1,
      child: 2,
      operation: 'delete',
    }
    const options = {
      method: 'PATCH',
      body: { branch, userID: 'userY' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)
    expect(response.status).toBe(200)
    const { meta } = response.CBOR_SC
    lastValidFrom = meta.lastValidFrom
    expect(meta.nodeCount).to.eq(3)
    assert(meta.validFrom <= meta.lastValidFrom)
    if (process?.env?.VITEST_BASE_URL == null) {
      const node2 = await state.storage.get(`2/snapshot/${lastValidFrom}`)
      const node1 = await state.storage.get(`1/snapshot/${lastValidFrom}`)
      expect(node2.meta.parents.length).toBe(1)
      assert(node2.meta.parents.includes('0'))
      expect(node1.meta.children.length).toBe(0)
    }
  })

  it('should "fail silently" when deleting the same branch again', async () => {
    const branch = {
      parent: 1,
      child: 2,
      operation: 'delete',
    }
    const options = {
      method: 'PATCH',
      body: { branch, userID: 'userY' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)
    expect(response.status).toBe(200)
    if (process?.env?.VITEST_BASE_URL == null) {
      const node2EntityMeta = await state.storage.get('2/entityMeta')
      const node2LastValidFrom = node2EntityMeta.timeline.at(-1)
      const node1EntityMeta = await state.storage.get('1/entityMeta')
      const node1LastValidFrom = node1EntityMeta.timeline.at(-1)
      // confirm that no new snapshots were created
      expect(lastValidFrom).to.eq(node2LastValidFrom)
      expect(lastValidFrom).to.eq(node1LastValidFrom)
    }
  })

  it('should allow moving a branch', async () => {
    const moveBranch = {
      node: 2,
      currentParent: 0,
      newParent: 1,
    }
    const options = {
      method: 'PATCH',
      body: { moveBranch, userID: 'userY' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)
    // console.log('response.CBOR_SC: %O: ', response.CBOR_SC)
    // console.log('list of nodes: %O: ', await state.storage.list())
    expect(response.status).toBe(200)

    const { meta } = response.CBOR_SC
    lastValidFrom = meta.lastValidFrom
    expect(meta.nodeCount).to.eq(3)
    assert(meta.validFrom <= lastValidFrom)
    if (process?.env?.VITEST_BASE_URL == null) {
      const node2 = await state.storage.get(`2/snapshot/${lastValidFrom}`)
      assert(node2.meta.parents.includes('1'))
      const node1 = await state.storage.get(`1/snapshot/${lastValidFrom}`)
      assert(node1.meta.children.includes('2'))
      const node0 = await state.storage.get(`0/snapshot/${lastValidFrom}`)
      expect(node0.meta.children.length).toBe(1)
      assert(node0.meta.children.includes('1'))
      assert(!node0.meta.children.includes('2'))
    }
  })

  it.todo('should return an error if a branch move creates a cycle', async () => {
  })
})

describe('Tree deleted and orphaned', () => {
  it.todo('should allow POST to the tree to add a node (alias for PATCH addNode)', async () => {
  })

  it.todo('should allow deleting a node as a pass-through operation', async () => {
  })

  it.todo('should work with deleted and orphaned nodes', async () => {
  })

  it.todo('should allow patching a node as a pass-through operation', async () => {
  })
})
