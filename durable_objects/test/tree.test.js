/* eslint-disable object-curly-newline */
/* eslint-disable no-unused-vars */
/* eslint-disable no-shadow */
import test from 'tape'
import { Tree } from '../index.mjs'

let crypto
const env = {}
// env.DEBUG = 'blueprint:*'  // uncomment to see debug output
env.DEBUG_COLORS = 1
try {
  crypto = await import('crypto')
  env.crypto = crypto
} catch (err) {
  throw new Error('crypto support not available!')
}

class StorageMock {
  constructor(initialData = {}) {
    this.data = structuredClone(initialData)
  }

  async put(key, value) {
    this.data[key] = structuredClone(value)
  }

  async get(key) {
    return structuredClone(this.data[key])
  }
}

function getStateMock(initialData = {}) {
  return { storage: new StorageMock(initialData) }
}

test('Tree parents and children', async (t) => {
  t.test('Create a Tree and do stuff to it', async (t) => {
    const state = getStateMock()
    const tree = new Tree(state, env, 'testTreeID')

    let response
    const rootNode = {
      value: { a: 1 },
      type: '***test-has-children***',
      version: 'v1',
    }
    response = await tree.post({ rootNode, userID: 'userW' })
    t.equal(response[1], 201, 'should get back 201 on successful tree and root node creation')
    t.equal(state.storage.data['0/entityMeta'].timeline.length, 1, 'should have 1 entry in timeline after 1st put')

    const newNode = {
      value: { b: 2 },
      type: '***test-has-children-and-parents***',
      version: 'v1',
    }
    response = await tree.patch({ addNode: { newNode, parent: '0' }, userID: 'userX' })
    t.equal(response[1], 201, 'should get back 201 on successful node creation')
    let { lastValidFrom } = response[0].meta
    t.assert(
      state.storage.data[`1/snapshot/${lastValidFrom}`].meta.parents.includes('0'),
      'should have correct parent on new node',
    )
    t.assert(
      state.storage.data[`0/snapshot/${lastValidFrom}`].meta.children.includes('1'),
      'should have correct child on root node',
    )

    try {
      const newNode = {
        value: { c: 3 },
        type: '***test-has-children-and-parents***',
        version: 'v1',
      }
      response = await tree.patch({ addNode: { newNode, parent: '999' }, userID: 'userY' })
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(e.status, 404, 'should see status 404 in e.status')
      t.assert(e.message.endsWith('TemporalEntity not found'), 'should throw if parent does not exist')
    }

    const newNode2 = {
      value: { c: 3 },
      type: '***test-has-children-and-parents***',
      version: 'v1',
    }
    response = await tree.patch({ addNode: { newNode: newNode2, parent: 1 }, userID: 'userY' })  // parent intentionally a Number to confirm that it's forgiving of this
    t.equal(response[1], 201, 'should get back 201 on successful node 2 creation')
    lastValidFrom = response[0].meta.lastValidFrom
    t.assert(
      state.storage.data[`2/snapshot/${lastValidFrom}`].meta.parents.includes('1'),
      'should have correct parent on node 2',
    )
    t.assert(
      state.storage.data[`1/snapshot/${lastValidFrom}`].meta.children.includes('2'),
      'should have node 2 as child on node 1',
    )

    try {
      const branch = {
        parent: 2,  // intentionally a Number to confirm that it's forgiving of this
        child: '1',
        operation: 'add',
      }
      response = await tree.patch({ branch, userID: 'userY' })
      lastValidFrom = response.childTE.current.meta.validFrom
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(e.status, 409, 'should see status 409 in e.status')
      t.assert(e.message.startsWith('Adding this branch would create a cycle'), 'should throw if parent does not exist')
      lastValidFrom = state.storage.data['testTreeID/treeMeta'].lastValidFrom
      t.equal(
        state.storage.data[`2/snapshot/${lastValidFrom}`].meta.parents.length,
        1,
        'should have 1 parent on node 2',
      )
      t.equal(
        state.storage.data[`1/snapshot/${lastValidFrom}`].meta.children.length,
        1,
        'should have 1 child on node 1',
      )
      t.equal(
        state.storage.data[`2/snapshot/${lastValidFrom}`].meta.children,
        undefined,
        'should have no children on node 2',
      )
      t.equal(
        state.storage.data[`1/snapshot/${lastValidFrom}`].meta.parents.length,
        1,
        'should have 1 parent on node 1',
      )
    }

    let branch = {
      parent: 0,  // intentionally a Number to confirm that it's forgiving of this as a zero
      child: 2,
      // operation: 'add',  // testing default operation by commenting this out
    }
    let { childTE, parentTE } = await tree.patch({ branch, userID: 'userY' })
    t.assert(childTE.current.meta.parents.includes('1'), 'should have correct 1st parent on childTE')
    t.assert(childTE.current.meta.parents.includes('0'), 'should have correct 2nd parent on childTE')
    t.assert(parentTE.current.meta.children.includes('1'), 'should have correct 1st child on parentTE')
    t.assert(parentTE.current.meta.children.includes('2'), 'should have correct 2nd child on parentTE')

    branch = {
      parent: 1,
      child: 2,
      operation: 'delete',
    }
    response = await tree.patch({ branch, userID: 'userY' })
    childTE = response.childTE
    parentTE = response.parentTE
    t.equal(childTE.current.meta.parents.length, 1, 'should have 1 parent on childTE')
    t.assert(childTE.current.meta.parents.includes('0'), 'should have correct parent on childTE')
    t.equal(parentTE.current.meta.children.length, 0, 'should have 0 children on parentTE')

    // console.log(state.storage.data)

    t.end()
  })
})
