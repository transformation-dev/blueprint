/* eslint-disable no-undef */

// 3rd party imports
// eslint-disable-next-line import/no-extraneous-dependencies
import { it, expect, assert } from 'vitest'

// monorepo imports
import { encodeFetchAndDecode, addCryptoToEnv } from '@transformation-dev/cloudflare-do-testing-utils'

// local imports
import { DurableAPI } from '../src/index.js'

const describe = setupMiniflareIsolatedStorage()
const env = getMiniflareBindings()
await addCryptoToEnv(env)
env.DEBUG = 'blueprint:*'

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

  it('should allow tree creation with POST', async () => {
    const rootNode = {
      value: { a: 1 },
      type: '***test-has-children***',
      version: 'v1',
    }
    const options = {
      method: 'POST',
      // headers: { 'Content-Type': 'application/cbor-sc' },  // auto-inserted by encodeFetchAndDecode
      body: { rootNode, userID: 'userW' },
    }
    const url = `${baseUrl}/tree/v1`
    const response = await encodeFetchAndDecode(url, options, stub)

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
    expect(idString).to.be.a('string')

    // storage operation expects/asserts to only run in miniflare
    if (process?.env?.VITEST_BASE_URL == null) {
      const value = await state.storage.get('0/entityMeta')
      expect(value.timeline.length).toBe(1)
    }
  })

  it.todo('should allow node creation with PATCH', async () => {
    const newNode = {
      value: { b: 2 },
      type: '***test-has-children-and-parents***',
      version: 'v1',
    }
    const response = await tree.patch({ addNode: { newNode, parent: '0' }, userID: 'userX' })
    expect(response[1]).toBe(201)
    const { lastValidFrom } = response[0].meta
    assert(state.storage.data[`1/snapshot/${lastValidFrom}`].meta.parents.includes('0'))
    assert(state.storage.data[`0/snapshot/${lastValidFrom}`].meta.children.includes('1'))
  })

  it.todo('should throw when sent non-existent parent', async () => {
    const newNode = {
      value: { c: 3 },
      type: '***test-has-children-and-parents***',
      version: 'v1',
    }
    try {
      await tree.patch({ addNode: { newNode, parent: '999' }, userID: 'userY' })
      assert(false)
    } catch (e) {
      expect(e.status).toBe(404)
      expect(e.message).toMatch('TemporalEntity not found')
    }
  })

  it.todo('should allow addition of another node', async () => {
    const newNode2 = {
      value: { c: 3 },
      type: '***test-has-children-and-parents***',
      version: 'v1',
    }
    const response = await tree.patch({ addNode: { newNode: newNode2, parent: 1 }, userID: 'userY' })  // parent intentionally a Number to confirm that it's forgiving of this
    expect(response[1]).toBe(201)
    const { lastValidFrom } = response[0].meta
    assert(state.storage.data[`2/snapshot/${lastValidFrom}`].meta.parents.includes('1'))
    assert(state.storage.data[`1/snapshot/${lastValidFrom}`].meta.children.includes('2'))
  })

  it.todo('should throw when adding a node that would create a cycle', async () => {
    const branch = {
      parent: 2,  // intentionally a Number to confirm that it's forgiving of this
      child: '1',
      operation: 'add',
    }
    try {
      await tree.patch({ branch, userID: 'userY' })
      assert(false)
    } catch (e) {
      expect(e.status).toBe(409)
      expect(e.message).toMatch('Adding this branch would create a cycle')
      const { lastValidFrom } = state.storage.data['testTreeID/treeMeta']
      expect(state.storage.data[`2/snapshot/${lastValidFrom}`].meta.parents.length).toBe(1)
      expect(state.storage.data[`1/snapshot/${lastValidFrom}`].meta.children.length).toBe(1)
      expect(state.storage.data[`2/snapshot/${lastValidFrom}`].meta.children).toBeUndefined()
      expect(state.storage.data[`1/snapshot/${lastValidFrom}`].meta.parents.length).toBe(1)
    }
  })

  it.todo('should allow addition of a branch that creates a diamond-shaped DAG', async () => {
    const branch = {
      parent: 0,  // intentionally a Number to confirm that it's forgiving of this as a zero
      child: 2,
      // operation: 'add',  // testing default operation by commenting this out
    }
    const { childTE, parentTE } = await tree.patch({ branch, userID: 'userY' })
    assert(childTE.current.meta.parents.includes('1'))
    assert(childTE.current.meta.parents.includes('0'))
    assert(parentTE.current.meta.children.includes('1'))
    assert(parentTE.current.meta.children.includes('2'))
  })

  it.todo('should allow deletion of a branch', async () => {
    const branch = {
      parent: 1,
      child: 2,
      operation: 'delete',
    }
    const { childTE, parentTE } = await tree.patch({ branch, userID: 'userY' })
    expect(childTE.current.meta.parents.length).toBe(1)
    assert(childTE.current.meta.parents.includes('0'))
    expect(parentTE.current.meta.children.length).toBe(0)
  })
})
