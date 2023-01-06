/* eslint-disable object-curly-newline */
/* eslint-disable no-unused-vars */
/* eslint-disable no-shadow */
import test from 'tape'
import { TemporalEntity } from '../src/temporal-entity.js'

class StorageMock {
  constructor(initialData = {}) {
    this.data = structuredClone(initialData)
  }

  async put(key, value) {
    this.data[key] = structuredClone(value)
  }

  async get(key) {
    return this.data[key]
  }
}

function getStateMock(initialData = {}) {
  return { storage: new StorageMock(initialData) }
}

test('TemporalEntity put(), patch(), and rehydrate', async (t) => {
  const state = getStateMock()
  const env = {}
  const te = new TemporalEntity(state, env)

  t.test('put() with only value and userID', async (t) => {
    await te.put({ a: 1, b: 2 }, 'user1')
    const [{ meta, value }, status] = await te.get()
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
    const fromGet = await te.get()
    await te.patch({ a: undefined, b: 3, c: 4 }, 'user2', newValidFromISOString, 'impersonator1', fromGet[0].meta.eTag)

    const [{ meta, value }, status] = await te.get()
    t.deepEqual(value, { b: 3, c: 4 }, 'should get back patched value (note, a was deleted)')
    t.equal(meta.impersonatorID, 'impersonator1', 'should get back impersonatorID')
    t.equal(state.storage.data.entityMeta.timeline.at(-1), newValidFromISOString, 'should have new validFrom in timeline')
    t.equal(state.storage.data.entityMeta.timeline.at(-2), lastValidFromISOString, 'should have old validFrom in timeline')
    t.equal(state.storage.data.entityMeta.timeline.length, 2, 'should have 2 entries in timeline')

    t.end()
  })

  t.test('rehydrate with old state', async (t) => {
    const te2 = new TemporalEntity(state, env)
    const [{ meta, value }, status] = await te2.get()
    t.deepEqual(value, { b: 3, c: 4 }, 'should get same value from rehydrated entity')
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
    const state2 = getStateMock()
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
      const response = await te2.put({ a: 100 }, 'userX')
      await te2.put({ a: 1000 }, 'userX', '1999-01-01T00:00:00.000Z', undefined, response.meta.eTag)
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(
        e.message,
        'the validFrom for a TemporalEntity update is not greater than the prior validFrom',
        'should throw if passed in validFrom is before prior validFrom',
      )
      t.equal(e.status, 400, 'should have status 400')
    }

    try {
      const response = await te2.put({ a: 1000 }, 'userX')
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(
        e.message,
        'ETag header required for TemporalEntity PUT',
        'should throw 412 if ETag is not passed in',
      )
      t.equal(e.status, 428, 'should have status 428')
    }

    try {
      const response2 = await te2.patch({ a: 2000 }, 'userX', undefined, undefined, '2000-01-01T00:00:00.000Z')  // random date so as not to match
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(
        e.message,
        'If-Match does not match current ETag',
        'should throw 412 if ETag does not match any prior validFrom',
      )
      t.equal(e.status, 412, 'should have status 412')
    }

    t.end()
  })
})

test('TemporalEntity idempotency', async (t) => {
  t.test('idempotency', async (t) => {
    const state3 = getStateMock()
    const env3 = {}
    const te3 = new TemporalEntity(state3, env3)

    const response3 = await te3.put({ a: 1 }, 'userY')
    t.equal(state3.storage.data.entityMeta.timeline.length, 1, 'should have 1 entry in timeline after 1st put')

    const response4 = await te3.put({ a: 1 }, 'userZ', undefined, undefined, response3.meta.eTag)
    t.equal(state3.storage.data.entityMeta.timeline.length, 1, 'should still have 1 entry in timeline after 2nd put with same value but different userID')

    const response5 = await te3.put({ a: 2 }, 'userZ', undefined, undefined, response4.meta.eTag)
    t.equal(state3.storage.data.entityMeta.timeline.length, 2, 'should have 2 entries in timeline after 3rd put with different value')

    await te3.put({ a: 2 }, 'userZ', undefined, undefined, response5.meta.eTag)
    t.equal(state3.storage.data.entityMeta.timeline.length, 2, 'should still have 2 entries in timeline after 4th put')

    t.end()
  })
})

test('TemporalEntity auto-incremented validFrom', async (t) => {
  t.test('auto-incremented validFrom', async (t) => {
    const state4 = getStateMock()
    const env4 = {}
    const te4 = new TemporalEntity(state4, env4)
    const validFromISOString = '2200-01-01T00:00:00.000Z'
    const lastValidFromDate = new Date(validFromISOString)
    const newValidFromDate = new Date(lastValidFromDate.getTime() + 1)  // 1 millisecond later
    const newValidFromISOString = newValidFromDate.toISOString()

    const response = await te4.put({ a: 1 }, 'userY', validFromISOString)
    await te4.put({ a: 2 }, 'userZ', undefined, undefined, response.meta.eTag)
    const [result, status] = await te4.get()
    t.equal(result.meta.validFrom, newValidFromISOString, 'should be 1ms later')

    t.end()
  })
})

test('deep object put and patch', async (t) => {
  t.test('deep patching', async (t) => {
    const state4 = getStateMock()
    const env4 = {}
    const te4 = new TemporalEntity(state4, env4)
    const o = { a: 2000, o: { a: 1, b: 2, children: [1, 'a', new Date()] } }

    const response = await te4.put(o, 'userX')
    const [result, status] = await te4.get()
    t.deepEqual(result.value, o, 'should get back same value')

    const response2 = await te4.patch({ o: { a: 2, c: 3 } }, 'userX', '2200-01-01T00:00:00.000Z', undefined, response.meta.eTag)
    const o2 = structuredClone(o)
    o2.o.a = 2
    o2.o.c = 3
    t.deepEqual(response2.value, o2, 'should get back deeply patched value')

    const response3 = await te4.patch({ o: { children: { 3: 'pushed' } } }, 'userX', '2200-01-02T00:00:00.000Z', undefined, response2.meta.eTag)
    const o3 = structuredClone(o2)
    o3.o.children.push('pushed')
    t.deepEqual(response3.value, o3, 'should get back deeply patched value for array')

    try {
      const response5 = await te4.patch({ a: 4000, o: { children: { 3: 'not pushed' } } }, 'userX', '2200-01-04T00:00:00.000Z', undefined, response.meta.eTag)
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(
        e.message,
        'If-Match does not match current ETag',
        'should throw if new value has conflict with intervening changes',
      )
    }

    t.end()
  })
})

test('get and getEntityMeta with correct eTag returns a 304', async (t) => {
  t.test('auto-incremented validFrom', async (t) => {
    const state4 = getStateMock()
    const env4 = {}
    const te4 = new TemporalEntity(state4, env4)

    const response = await te4.put({ a: 1 }, 'userY')
    const [result, status] = await te4.get()
    t.equal(status, 200, 'should be 200')
    t.deepEqual(result.value, { a: 1 }, 'should be { a: 1 }')

    const [result2, status2] = await te4.get(response.meta.eTag)
    t.equal(status2, 304, 'should be 304')
    t.equal(result2, undefined, 'should be undefined')

    const [result3, status3] = await te4.getEntityMeta(response.meta.eTag)
    t.equal(status3, 304, 'should be 304')
    t.equal(result3, undefined, 'should be undefined')

    t.end()
  })
})

test('TemporalEntity debouncing', async (t) => {
  t.test('debouncing', async (t) => {
    const state3 = getStateMock()
    const env3 = {}
    const te3 = new TemporalEntity(state3, env3)

    const firstCurrent = await te3.put({ a: 1 }, 'userY')
    const middleCurrent = await te3.put({ a: 2 }, 'userY', undefined, undefined, firstCurrent.meta.eTag)
    t.equal(
      state3.storage.data.entityMeta.timeline.length,
      1,
      'should still have 1 entry in timeline after 2th put with different value and same userID',
    )
    const [{ meta, value }, status] = await te3.get()
    t.deepEqual(value, { a: 2 }, 'should get back last value')
    t.equal(meta.validFrom, firstCurrent.meta.validFrom, 'should get back first validFrom')
    const pv = Object.create(null)
    pv.a = undefined
    t.deepEqual(meta.previousValues, pv, 'should get back previousValues like it was the first put')

    const secondCurrent = await te3.put({ a: 3 }, 'userZ', undefined, undefined, middleCurrent.meta.eTag)
    await te3.put({ a: 4 }, 'userZ', undefined, undefined, secondCurrent.meta.eTag)
    t.equal(
      state3.storage.data.entityMeta.timeline.length,
      2,
      'should have 2 entries in timeline after 3th put with a different userID',
    )
    const [newCurrent, newStatus] = await te3.get()
    t.deepEqual(newCurrent.value, { a: 4 }, 'should get back last value')
    t.equal(newCurrent.meta.validFrom, secondCurrent.meta.validFrom, 'should get back second validFrom')

    const newValidFromDate = new Date(new Date(newCurrent.meta.validFrom).getTime() + 61 * 60 * 1000) // 61 minutes later
    await te3.put({ a: 5 }, 'userZ', newValidFromDate.toISOString(), undefined, newCurrent.meta.eTag)
    t.equal(
      state3.storage.data.entityMeta.timeline.length,
      3,
      'should have 3 entries after 4th put with same userID but 61 minutes in the future',
    )
    const [newCurrent3, newStatus3] = await te3.get()
    t.deepEqual(newCurrent3.value, { a: 5 }, 'should get back last value')

    t.end()
  })

  test('TemporalEntity PUT fails with old ETag', async (t) => {
    t.test('optimistic concurrency', async (t) => {
      const state3 = getStateMock()
      const env3 = {}
      const te3 = new TemporalEntity(state3, env3)

      const response3 = await te3.put({ a: 1, b: 2, c: 3, d: 4 }, 'userY', '2200-01-01T00:00:00.000Z')
      t.equal(state3.storage.data.entityMeta.timeline.length, 1, 'should have 1 entry in timeline after 1st put')

      const response4 = await te3.put({ a: 10, b: 2, c: 3, d: 4 }, 'userY', '2200-01-02T00:00:00.000Z', undefined, response3.meta.eTag)
      t.equal(state3.storage.data.entityMeta.timeline.length, 2, 'should have 2 entries in timeline after 2nd put')

      try {
        await te3.put({ a: 1, b: 2, c: 25, d: 40 }, 'userY', '2200-01-05T00:00:00.000Z', undefined, response3.meta.eTag)
        t.fail('async thrower did not throw')
      } catch (e) {
        t.equal(
          e.message,
          'If-Match does not match current ETag',
          'should throw if old ETag is used',
        )
        t.equal(e.status, 412, 'should see status 412 in e.status')
        t.deepEqual(
          e.body.value,
          { a: 10, b: 2, c: 3, d: 4 },
          'should get back the current value of the entity if the fields are the same',
        )
        t.equal(e.body.meta.validFrom, '2200-01-02T00:00:00.000Z', 'should get back the validFrom of the last successful update')
        t.equal(e.body.error.status, 412, 'should see status 412 in e.body.error.status')
      }

      t.end()
    })
  })
})
