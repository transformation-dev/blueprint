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
  return { storage: new StorageMock(initialData) }  // id must be undefined for unit tests to pass due to the validation that state.id match the id in the url
}

test('TemporalEntity parents and children', async (t) => {
  t.test('parents and children', async (t) => {
    const state = getStateMock()
    const tree = new Tree(state, env, 'testTreeID')

    let response
    const rootNode = {
      value: { a: 1 },
      type: '***test-has-children***',
      version: 'v1',
    }
    response = await tree.post({ rootNode, userID: 'userW' })
    console.log(state.storage.data)
    t.equal(state.storage.data['0/entityMeta'].timeline.length, 1, 'should have 1 entry in timeline after 1st put')

    const newNode = {
      value: { b: 2 },
      type: '***test-has-children-and-parents***',
      version: 'v1',
    }
    response = await tree.patch({ addNode: { newNode, parentID: '0' }, userID: 'userX' })
    const { lastValidFrom } = response[0]
    t.deepEqual(
      state.storage.data[`1/snapshot/${lastValidFrom}`].meta.parents,
      { 0: true },
      'should have correct parent on new node',
    )
    t.deepEqual(
      state.storage.data[`0/snapshot/${lastValidFrom}`].meta.children,
      { 1: true },
      'should have correct child on root node',
    )

    try {
      const newNode = {
        value: { c: 3 },
        type: '***test-has-children-and-parents***',
        version: 'v1',
      }
      response = await tree.patch({ addNode: { newNode, parentID: 'not-there' }, userID: 'userY' })
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(e.status, 404, 'should see status 404 in e.status')
      t.equal(e.message, 'not-there TemporalEntity not found', 'should throw if parent does not exist')
    }

    console.log(state.storage.data)

    t.end()
  })
})
