/* eslint-disable import/no-extraneous-dependencies */

// 3rd party imports
import { describe, it, expect, assert } from 'vitest'

// monorepo imports
import { getStateMock, getEnvMock } from '@transformation-dev/cloudflare-do-testing-utils'

// local imports
import { Tree } from '../index.mjs'

// initialize imports
// const env = getEnvMock()  // defaults to DEBUG: 'blueprint:*'. call with getEnvMock({ DEBUG: 'something:*' }) to change debug scope filter
const env = await getEnvMock({})

describe('Tree', async () => {
  const state = getStateMock()  // getting a new state mock for each test
  const tree = new Tree(state, env, 'testTreeID')
  it('should allow tree creation with POST', async () => {
    const rootNode = {
      value: { a: 1 },
      type: '***test-has-children***',
      version: 'v1',
    }
    const response = await tree.post({ rootNode, userID: 'userW' })
    expect(response[1]).toBe(201)
    expect(state.storage.data['0/entityMeta'].timeline.length).toBe(1)
  })

  it('should allow node creation with PATCH', async () => {
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

  it('should throw when sent non-existent parent', async () => {
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

  it('should allow addition of another node', async () => {
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

  it('should throw when adding a node that would create a cycle', async () => {
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

  it('should allow addition of a branch that creates a diamond-shaped DAG', async () => {
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

  it('should allow deletion of a branch', async () => {
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
