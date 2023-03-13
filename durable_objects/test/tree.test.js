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
env.DEBUG = 'blueprint:*'
// env.DEBUG = 'blueprint:tree'
// env.DEBUG = 'nothing'

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
    const rootNodeValue = { label: 'root (aka node0)' }
    const options = {
      method: 'POST',
      body: { rootNodeValue, userID: 'userW' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)

    // expects/asserts to always run
    expect(response.status).toBe(201)
    const { current, idString } = response.CBOR_SC
    const { meta } = current
    expect(meta.validFrom).to.be.a('string')
    assert(meta.validFrom <= new Date().toISOString())
    expect(meta.userID).to.eq('userW')
    expect(response.headers.get('Content-ID')).to.eq(idString)
    expect(idString).to.be.a('string')
    url += `/${idString}`

    // storage operation expects/asserts to only run in miniflare (aka not live over http)
    if (process?.env?.VITEST_BASE_URL == null) {
      const storage = await state.storage.list()
      const entityMeta = storage.get(`${idString}/entityMeta`)
      expect(entityMeta.timeline.length).toBe(1)
      expect(entityMeta.nodeCount).toBe(1)
      assert(meta.validFrom === entityMeta.timeline.at(-1))
      const nodes = storage.get(`${idString}/snapshot/${meta.validFrom}/nodes`)
      expect(nodes[0].label).to.eq(rootNodeValue.label)
      expect(nodes[0].nodeIDString).to.not.eq(idString)
    }
  })

  it('should allow node creation with PATCH', async () => {
    const value = { label: 'node1' }
    const options = {
      method: 'PATCH',
      body: { addNode: { value, parent: '0' }, userID: 'userX' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)
    expect(response.status).toBe(200)
    const { current, idString } = response.CBOR_SC
    const { meta } = current
    if (process?.env?.VITEST_BASE_URL == null) {
      const storage = await state.storage.list()
      const entityMeta = storage.get(`${idString}/entityMeta`)
      expect(entityMeta.timeline.length).toBe(2)
      expect(entityMeta.nodeCount).toBe(2)
      assert(meta.validFrom <= entityMeta.timeline.at(-1))
      const nodes = storage.get(`${idString}/snapshot/${meta.validFrom}/nodes`)
      expect(nodes[1].label).to.eq(value.label)
      expect(nodes[1].nodeIDString).to.not.eq(idString)
      const edges = storage.get(`${idString}/snapshot/${meta.validFrom}/edges`)
      expect(edges[0]).to.deep.eq(['1'])
    }
  })

  it('should respond with error when sent non-existent parent', async () => {
    const value = { label: 'node2' }
    const options = {
      method: 'PATCH',
      body: { addNode: { value, parent: '999' }, userID: 'userY' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)
    expect(response.status).toBe(404)
    expect(response.CBOR_SC.error.message).toMatch('not found')
  })

  let lastValidFrom

  it('should allow addition of another node', async () => {
    const value = { label: 'node2' }
    const options = {
      method: 'PATCH',
      body: { addNode: { value, parent: 1 }, userID: 'userY' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)
    expect(response.status).toBe(200)
    const { current, idString } = response.CBOR_SC
    const { meta } = current
    lastValidFrom = meta.validFrom
    if (process?.env?.VITEST_BASE_URL == null) {
      const storage = await state.storage.list()
      const entityMeta = storage.get(`${idString}/entityMeta`)
      expect(entityMeta.timeline.length).toBe(3)
      expect(entityMeta.nodeCount).toBe(3)
      assert(meta.validFrom <= entityMeta.timeline.at(-1))
      const nodes = storage.get(`${idString}/snapshot/${meta.validFrom}/nodes`)
      expect(nodes[2].label).to.eq(value.label)
      expect(nodes[2].nodeIDString).to.not.eq(idString)
      const edges = storage.get(`${idString}/snapshot/${meta.validFrom}/edges`)
      expect(edges[1]).to.deep.eq(['2'])
    }
  })

  it('should respond with error when adding a node that would create a cycle', async () => {
    const addBranch = {
      parent: 2,  // intentionally a Number to confirm that it's forgiving of this
      child: '1',
    }
    const options = {
      method: 'PATCH',
      body: { addBranch, userID: 'userY' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)
    expect(response.status).toBe(409)
    const { error, idString } = response.CBOR_SC
    expect(response.status).toBe(409)
    expect(error.message).toMatch('Adding this branch would create a cycle')
    if (process?.env?.VITEST_BASE_URL == null) {
      const storage = await state.storage.list()
      const entityMetaFromStorage = storage.get(`${idString}/entityMeta`)
      expect(entityMetaFromStorage.timeline.length).toBe(3)
      expect(entityMetaFromStorage.timeline.at(-1)).toBe(lastValidFrom)
    }
  })

  it('should allow addition of a branch that creates a diamond-shaped DAG', async () => {
    const addBranch = {
      parent: 0,  // intentionally a Number to confirm that it's forgiving of this as a zero
      child: '2',
    }
    const options = {
      method: 'PATCH',
      body: { addBranch, userID: 'userY' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)
    expect(response.status).toBe(200)
    const { current, idString } = response.CBOR_SC
    const { meta } = current
    if (process?.env?.VITEST_BASE_URL == null) {
      const storage = await state.storage.list()
      const entityMeta = storage.get(`${idString}/entityMeta`)
      expect(entityMeta.nodeCount).to.eq(3)
      expect(entityMeta.timeline.length).toBe(4)
      const edges = storage.get(`${idString}/snapshot/${meta.validFrom}/edges`)
      expect(edges[0]).to.deep.eq(['1', '2'])
    }
  })

  const tree = {
    label: 'root (aka node0)',
    children: [
      {
        label: 'node1',
        children: [
          {
            label: 'node2',
          },
        ],
      },
      {
        label: 'node2',
      },
    ],
  }

  it('should return the tree and meta with GET', async () => {
    const response = await encodeFetchAndDecode(`${url}?asOf=${new Date().toISOString()}`, undefined, stub)
    expect(response.status).toBe(200)
    expect(response.CBOR_SC.current.tree).toMatchObject(tree)
    // this next line confirms that node2 is only transmitted once eventhough it shows up twice in the tree
    expect(response.CBOR_SC.current.tree.children[0].children[0]).toBe(response.CBOR_SC.current.tree.children[1])
  })

  it('should respond to GET entity-meta', async () => {
    const response = await encodeFetchAndDecode(`${url}/entity-meta/`, undefined, stub)
    const { timeline, nodeCount } = response.CBOR_SC
    expect(response.status).toBe(200)
    expect(timeline.length).toBe(4)
    expect(nodeCount).toBe(3)
  })

  it('should be "fail silently" when you add the same branch again', async () => {
    // TODO: Confirm that we don't end up with the child or parent duplicated
    const addBranch = {
      parent: 0,  // intentionally a Number to confirm that it's forgiving of this as a zero
      child: 2,
    }
    const options = {
      method: 'PATCH',
      body: { addBranch, userID: 'userY' },
    }
    const response = await encodeFetchAndDecode(url, options, stub, state)
    // console.log('response.CBOR_SC.tree: %s: ', JSON.stringify(response.CBOR_SC.tree, null, 2))
    console.log('response.CBOR_SC: %O: ', response.CBOR_SC)
    expect(response.status).toBe(200)
    const { current: { meta }, idString } = response.CBOR_SC
    assert(meta.validFrom > lastValidFrom)
    lastValidFrom = meta.validFrom
    if (process?.env?.VITEST_BASE_URL == null) {
      const storage = await state.storage.list()
      console.log('storage: %O: ', storage)
      const entityMeta = storage.get(`${idString}/entityMeta`)
      expect(entityMeta.nodeCount).to.eq(3)
      expect(entityMeta.timeline.length).toBe(4)
      const edges = storage.get(`${idString}/snapshot/${meta.validFrom}/edges`)
      expect(edges[0]).to.deep.eq(['1', '2'])
    }
  })

  it.todo('should allow deletion of a branch', async () => {
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

  it.todo('should "fail silently" when deleting the same branch again', async () => {
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

  it.todo('should allow moving a branch', async () => {
    const moveBranch = {
      child: 2,
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

  it.todo('should also work with text/yaml Content-Type', () => {
  })

  it.todo('should return error with application/json Content-Type', () => {
  })

  it.todo('should return an earlier version of the Tree when GET with ?asOf parameter is used', () => {
  })

  it.todo('should return 304 when If-Modified-Since header is used with the exact validFrom from last change', () => {
  })

  it.todo('should return 200 when If-Modified-Since header is used with last validFrom - 1ms', () => {
  })
})

describe('Tree deleted and orphaned', () => {
  it.todo('should update Tree with status using queues when node DO is deleted', async () => {
  })

  it.todo('should work with deleted nodes', async () => {
  })

  it.todo('should work with orphaned nodes', async () => {
  })
})
