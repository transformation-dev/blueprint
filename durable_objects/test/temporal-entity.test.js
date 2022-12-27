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
  return { storage: new Storage(initialData) }
}

test('TemporalEntity PUT and PATCH', async (t) => {
  const state = getNewState()
  const env = {}
  const te = new TemporalEntity(state, env)

  t.test('put() with only value and userID', async (t) => {
    await te.put({ a: 1, b: 2 }, 'user1')
    const { meta, value } = await te.get()
    t.deepEqual(value, { a: 1, b: 2 }, 'should get back value')
    t.equal(meta.userID, 'user1', 'should get back userID')
    const pv = Object.create(null)
    pv.a = undefined
    pv.b = undefined
    t.deepEqual(meta.previousValues, pv, 'should have previousValue with undefined')
    t.assert(meta.validFrom <= new Date().toISOString, 'should initialize validFrom with a date before now')
    t.equal(meta.validTo, TemporalEntity.END_OF_TIME, 'should initialize validTo with TemporalEntity.END_OF_TIME')
    t.assert(!Object.hasOwn(meta, 'impersonatorID', 'should not contain impersonatorID'))

    t.end()
  })

  t.test('patch() with validFrom and impersonatorID (note, this also tests put())', async (t) => {
    const lastValidFromISOString = state.storage.data.entityMeta.timeline.at(-1)
    const lastValidFromDate = new Date(lastValidFromISOString)
    const newValidFromDate = new Date(lastValidFromDate.getTime() + 1)  // 1 millisecond later
    const newValidFromISOString = newValidFromDate.toISOString()
    await te.patch({ a: undefined, b: 3, c: 4 }, 'user2', newValidFromISOString, 'impersonator1')

    const { meta, value } = await te.get()
    t.deepEqual(value, { b: 3, c: 4 }, 'should get back patched value (note, a was deleted)')
    t.equal(meta.impersonatorID, 'impersonator1', 'should get back impersonatorID')
    t.equal(state.storage.data.entityMeta.timeline.at(-1), newValidFromISOString, 'should have new validFrom in timeline')
    t.equal(state.storage.data.entityMeta.timeline.at(-2), lastValidFromISOString, 'should have old validFrom in timeline')
    t.equal(state.storage.data.entityMeta.timeline.length, 2, 'should have 2 entries in timeline')

    t.end()
  })
})

test('TemporalEntity END_OF_TIME', async (t) => {
  t.test('END_OF_TIME', (t) => {
    t.equal(TemporalEntity.END_OF_TIME, '9999-01-01T00:00:00.000Z', 'should be equal to 9999-01-01T00:00:00.000Z')

    t.end()
  })
})

test('TemporalEntity validation', async (t) => {
  t.test('validation', async (t) => {
    const state2 = getNewState()
    const env2 = {}
    const te2 = new TemporalEntity(state2, env2)

    try {
      await te2.patch({ a: 100 }, 'userX')
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(e.message, 'cannot call TemporalEntity PATCH when there is no prior value', 'should throw if attempted to patch() with no prior value')
      t.equal(e.status, 400, 'should have status 400')
    }

    try {
      await te2.put(undefined, 'userX')
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(e.message, 'value required by TemporalEntity PUT is missing', 'should throw if attempted to put() without value')
      t.equal(e.status, 400, 'should have status 400')
    }

    try {
      await te2.put({ a: 10 })
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(e.message, 'userID required by TemporalEntity operation is missing', 'should throw if attempted to put() without userID')
      t.equal(e.status, 400, 'should have status 400')
    }

    try {
      await te2.put({ a: 100 }, 'userX')
      await te2.put({ a: 1000 }, 'userX', '1999-01-01T00:00:00.000Z')
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(
        e.message,
        'the validFrom for a TemporalEntity update is not greater than the prior validFrom',
        'should throw if passed in validFrom is before prior validFrom',
      )
      t.equal(e.status, 400, 'should have status 400')
    }

    t.end()
  })
})

test('TemporalEntity idempotency', async (t) => {
  t.test('idempotency', async (t) => {
    const state3 = getNewState()
    const env3 = {}
    const te3 = new TemporalEntity(state3, env3)

    await te3.put({ a: 1 }, 'userY')
    t.equal(state3.storage.data.entityMeta.timeline.length, 1, 'should have 1 entry in timeline after 1st put')

    await te3.put({ a: 1 }, 'userZ')
    t.equal(state3.storage.data.entityMeta.timeline.length, 1, 'should still have 1 entry in timeline after 2nd put with same value but different userID')

    await te3.put({ a: 2 }, 'userZ')
    t.equal(state3.storage.data.entityMeta.timeline.length, 2, 'should have 2 entries in timeline after 3rd put with different value')

    await te3.put({ a: 2 }, 'userZ')
    t.equal(state3.storage.data.entityMeta.timeline.length, 2, 'should still have 2 entries in timeline after 4th put')

    t.end()
  })
})

test('TemporalEntity auto-incremented validFrom', async (t) => {
  t.test('auto-incremented validFrom', async (t) => {
    const state4 = getNewState()
    const env4 = {}
    const te4 = new TemporalEntity(state4, env4)
    const validFromISOString = '2200-01-01T00:00:00.000Z'
    const lastValidFromDate = new Date(validFromISOString)
    const newValidFromDate = new Date(lastValidFromDate.getTime() + 1)  // 1 millisecond later
    const newValidFromISOString = newValidFromDate.toISOString()

    await te4.put({ a: 1 }, 'userY', validFromISOString)
    await te4.put({ a: 2 }, 'userZ')
    const result = await te4.get()
    t.equal(result.meta.validFrom, newValidFromISOString, 'should be 1ms later')

    t.end()
  })
})

test('TemporalEntity debouncing', async (t) => {
  t.test('debouncing', async (t) => {
    const state3 = getNewState()
    const env3 = {}
    const te3 = new TemporalEntity(state3, env3)

    const firstCurrent = await te3.put({ a: 1 }, 'userY')
    await te3.put({ a: 2 }, 'userY')
    t.equal(
      state3.storage.data.entityMeta.timeline.length,
      1,
      'should still have 1 entry in timeline after 2th put with different value and same userID',
    )
    const { meta, value } = await te3.get()
    t.deepEqual(value, { a: 2 }, 'should get back last value')
    t.equal(meta.validFrom, firstCurrent.meta.validFrom, 'should get back first validFrom')
    const pv = Object.create(null)
    pv.a = undefined
    t.deepEqual(meta.previousValues, pv, 'should get back previousValues like it was the first put')

    const secondCurrent = await te3.put({ a: 3 }, 'userZ')
    await te3.put({ a: 4 }, 'userZ')
    t.equal(
      state3.storage.data.entityMeta.timeline.length,
      2,
      'should still have 2 entries in timeline after 3th put with different value and same userID',
    )
    const newCurrent = await te3.get()
    t.deepEqual(newCurrent.value, { a: 4 }, 'should get back last value')
    t.equal(newCurrent.meta.validFrom, secondCurrent.meta.validFrom, 'should get back second validFrom')

    t.end()
  })
})
