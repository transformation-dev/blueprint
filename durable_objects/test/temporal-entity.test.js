/* eslint-disable no-unused-vars */
/* eslint-disable no-shadow */
import test from 'tape'
import { TemporalEntity } from '../src/temporal-entity.js'

class Storage {
  constructor(initialData = {}) {
    this.data = structuredClone(initialData)
  }

  put(key, value) {
    this.data[key] = structuredClone(value)
  }

  get(key) {
    return this.data[key]
  }
}

function getNewState(initialData = {}) {
  const blockConcurrencyWhile = async (fn) => {
    await fn()
  }
  return { storage: new Storage(initialData), blockConcurrencyWhile }
}

test('TemporalEntity', async (t) => {
  const state = getNewState()
  const env = {}
  const te = new TemporalEntity(state, env)

  t.test('put() with only value and userID', (t) => {
    te.put({ a: 1, b: 2 }, 'user1')
    const { meta, value } = te.get()
    t.deepEqual(value, { a: 1, b: 2 }, 'should get back value')
    t.equal(meta.userID, 'user1', 'should get back userID')
    const pv = Object.create(null)
    pv.a = undefined
    pv.b = undefined
    t.deepEqual(meta.previousValues, pv, 'should have previousValue with undefined')
    t.assert(meta.validFrom <= new Date().toISOString, 'should initialize validFrom with a date before now')
    t.equal(meta.validTo, TemporalEntity.END_OF_TIME, 'should initialize validTo with TemporalEntity.END_OF_TIME')
    t.equal(meta.impersonatorID, null, 'should initialize impersonatorID with null')
    t.end()
  })

  t.test('patch() with validFrom and impersonatorID (note, this also tests put())', (t) => {
    const lastValidFromISOString = state.storage.data.entityMeta.timeline.at(-1)
    const lastValidFromDate = new Date(lastValidFromISOString)
    const newValidFromDate = new Date(lastValidFromDate.getTime() + 1)  // 1 millisecond later
    const newValidFromISOString = newValidFromDate.toISOString()
    te.patch({ a: undefined, b: 3, c: 4 }, 'user2', newValidFromISOString, 'impersonator1')

    const { meta, value } = te.get()
    t.deepEqual(value, { b: 3, c: 4 }, 'should get back patched value (note, a was deleted)')
    t.equal(meta.impersonatorID, 'impersonator1', 'should get back impersonatorID')
    t.equal(state.storage.data.entityMeta.timeline.at(-1), newValidFromISOString, 'should have new validFrom in timeline')

    t.end()
  })

  t.test('END_OF_TIME', (t) => {
    t.equal(TemporalEntity.END_OF_TIME, '9999-01-01T00:00:00.000Z', 'should be equal to 9999-01-01T00:00:00.000Z')
    t.end()
  })

  t.test('validation', async (t) => {
    const state2 = getNewState()
    const env2 = {}
    const te2 = new TemporalEntity(state2, env2)

    try {
      await te2.put(undefined, 'userX')
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(e.message, 'value required by TemporalEntity put() is missing', 'should throw if attempted to put() without value')
    }

    try {
      await te2.put({ a: 10 })
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(e.message, 'userID required by TemporalEntity put() is missing', 'should throw if attempted to put() without userID')
    }

    t.end()
  })
})
