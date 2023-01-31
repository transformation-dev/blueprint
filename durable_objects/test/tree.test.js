/* eslint-disable object-curly-newline */
/* eslint-disable no-unused-vars */
/* eslint-disable no-shadow */
import test from 'tape'
import { TemporalEntity } from '../index.mjs'

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
    const root = new TemporalEntity(state, env, '***test-has-children***', 'v1', 'rootID')

    let response = await root.put({ a: 1 }, 'userW')
    t.equal(state.storage.data['rootID/entityMeta'].timeline.length, 1, 'should have 1 entry in timeline after 1st put')

    try {
      response = await root.patchAddChild({ addChild: { childID: 'child1ID' }, userID: 'userW' })
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(e.status, 404, 'should see status 404 in e.status')
      t.equal(e.message, 'child1ID TemporalEntity not found', 'should throw if child does not exist')
    }

    const child1 = new TemporalEntity(state, env, '***test-has-children-and-parents***', 'v1', 'child1ID')
    response = await child1.put({ a: 1 }, 'userW')
    response = await root.patchAddChild({ addChild: { childID: 'child1ID' }, userID: 'userW' })
    t.deepEqual(response.meta.children, { child1ID: true }, 'root should have child1ID as child')

    response = await child1.get()
    // console.log(response[0])

    console.log(state.storage.data)

    t.end()
  })
})
