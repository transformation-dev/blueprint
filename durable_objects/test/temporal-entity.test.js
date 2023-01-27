/* eslint-disable object-curly-newline */
/* eslint-disable no-unused-vars */
/* eslint-disable no-shadow */
import test from 'tape'
import { TemporalEntity } from '../index.mjs'

let crypto
const env = {}
env.DEBUG = 'blueprint:*'  // uncomment to see debug output
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

test('TemporalEntity accessing static properties in subclass', async (t) => {  // TODO: this test needs to move to the blueprint suite once TemporalEntityBase is in a package
  t.test('Subclass types', (t) => {
    t.true(
      TemporalEntity.types['***test-type-in-subclass***']['***test-property-in-type-in-subclass***'],
      'should have bogus property from subclass',
    )

    t.end()
  })
})

test('TemporalEntity put(), patch(), and rehydrate', async (t) => {
  const state = getStateMock()
  const te = new TemporalEntity(state, env, '*', '*', 'testIDString')

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
    await te.patch(
      {
        delta: { a: undefined, b: 3, c: 4 },
        userID: 'user2',
        validFrom: newValidFromISOString,
        impersonatorID: 'impersonator1',
      },
      fromGet[0].meta.eTag,
    )

    const [{ meta, value }, status] = await te.get()
    t.deepEqual(value, { b: 3, c: 4 }, 'should get back patched value (note, a was deleted)')
    t.equal(meta.impersonatorID, 'impersonator1', 'should get back impersonatorID')
    t.equal(state.storage.data.entityMeta.timeline.at(-1), newValidFromISOString, 'should have new validFrom in timeline')
    t.equal(state.storage.data.entityMeta.timeline.at(-2), lastValidFromISOString, 'should have old validFrom in timeline')
    t.equal(state.storage.data.entityMeta.timeline.length, 2, 'should have 2 entries in timeline')

    t.end()
  })

  t.test('rehydrate with old state', async (t) => {
    const te2 = new TemporalEntity(state, env, '*', '*', 'testIDString')
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

test('TemporalEntity validation for invalid or missing type', async (t) => {
  t.test('missing type', async (t) => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env)

    try {
      await te.put({ a: 100 }, 'userX')
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(e.message, 'Entity type, undefined, not found', 'should throw when no type is provided')
      t.equal(e.status, 404, 'should have status 404')
    }
  })

  t.test('unknown type', async (t) => {
    const state = getStateMock()

    try {
      const te = new TemporalEntity(state, env, '***unknown***', 'v1', 'testIDString')
      await te.put({ a: 100 }, 'userX')
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(e.message, 'Entity type, ***unknown***, not found', 'should throw when an unknown type is provided')
      t.equal(e.status, 404, 'should have status 404')
    }
  })
})

test('TemporalEntity validation', async (t) => {
  t.test('validation', async (t) => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '*', '*', 'testIDString')

    try {
      await te.patch({
        delta: { a: 100 },
        userID: 'userX',
      })
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(e.message, 'cannot call TemporalEntity PATCH when there is no prior value', 'should throw if attempted to patch() with no prior value')
      t.equal(e.status, 400, 'should have status 400')
    }

    try {
      await te.put(undefined, 'userX')
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(e.message, 'body.value field required by TemporalEntity PUT is missing', 'should throw if attempted to put() without value')
      t.equal(e.status, 400, 'should have status 400')
    }

    try {
      await te.put({ a: 10 })
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(e.message, 'userID required by TemporalEntity operation is missing', 'should throw if attempted to put() without userID')
      t.equal(e.status, 400, 'should have status 400')
    }

    try {
      const response = await te.put({ a: 100 }, 'userX')
      await te.put({ a: 1000 }, 'userX', '1999-01-01T00:00:00.000Z', undefined, response.meta.eTag)
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
      const response = await te.put({ a: 1000 }, 'userX')
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(
        e.message,
        'required ETag header for TemporalEntity PUT is missing',
        'should throw 412 if ETag is not passed in',
      )
      t.equal(e.status, 428, 'should have status 428')
    }

    try {
      const response2 = await te.patch(
        {
          delta: { a: 2000 },
          userID: 'userX',
        },
        '0123456789abcdef',  // random eTag so as not to match
      )
      t.fail('async thrower did not throw')
    } catch (e) {
      t.equal(
        e.message,
        'If-Match does not match this TemporalEntity\'s current ETag',
        'should throw 412 if ETag does not match current eTag',
      )
      t.equal(e.status, 412, 'should have status 412')
    }

    t.end()
  })
})

test('TemporalEntity DAG', async (t) => {
  t.test('valid DAG matching schema should not throw', async (t) => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '***test-dag***', 'v1', 'testIDString')

    const dag = {
      id: '1',
      children: [
        {
          id: '2',
        },
      ],
    }
    const value = {
      a: 1,
      dag,
    }

    let response

    try {
      response = await te.put(value, 'userW')
      t.pass('should not throw')
    } catch (e) {
      t.fail('a valid DAG should not throw')
    }

    t.end()
  })

  t.test('invalid DAG because of cycle should throw', async (t) => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '***test-dag***', 'v1', 'testIDString')

    const dag = {
      id: '1',
      children: [
        {
          id: '1',
        },
      ],
    }
    const value = {
      a: 1,
      dag,
    }

    let response

    try {
      response = await te.put(value, 'userW')
      t.fail('async thrower did not throw')
    } catch (e) {
      t.pass('should throw')
    }

    t.end()
  })

  t.test('invalid DAG because of duplicate sibling should throw', async (t) => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '***test-dag***', 'v1', 'testIDString')

    const dag = {
      id: '1',
      children: [
        {
          id: '2',
        },
        {
          id: '2',
        },
      ],
    }
    const value = {
      a: 1,
      dag,
    }

    let response

    try {
      response = await te.put(value, 'userW')
      t.fail('async thrower did not throw')
    } catch (e) {
      t.pass('should throw')
    }

    t.end()
  })

  t.test('valid DAG but not matching schema should throw', async (t) => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '***test-dag***', 'v1', 'testIDString')

    const dag = {
      id: '1',
      children: [
        {
          id: '2',
        },
      ],
    }
    const value = {
      a: 'string when a number is expected',
      dag,
    }

    let response

    try {
      response = await te.put(value, 'userW')
      t.fail('async thrower did not throw')
    } catch (e) {
      t.true(e.message.startsWith('Schema validation failed'), 'should start with "Schema validation failed"')
      t.pass('should throw')
    }

    t.end()
  })
})

test('TemporalEntity supressPreviousValues', async (t) => {
  t.test('idempotency', async (t) => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '***test-supress-previous-values***', 'v1', 'testIDString')

    let response = await te.put({ a: 1 }, 'userW')
    t.equal(state.storage.data.entityMeta.timeline.length, 1, 'should have 1 entry in timeline after 1st put')

    response = await te.put({ a: 2 }, 'userX', undefined, undefined, response.meta.eTag)
    t.equal(state.storage.data.entityMeta.timeline.length, 2, 'should have 2 entries in timeline after 2nd put')

    t.equal(response.meta.previousValues, undefined, 'should not have previousValues in response')

    t.end()
  })
})

test('TemporalEntity idempotency', async (t) => {
  t.test('idempotency', async (t) => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '*', '*', 'testIDString')

    let response = await te.put({ a: 1 }, 'userW')
    t.equal(state.storage.data.entityMeta.timeline.length, 1, 'should have 1 entry in timeline after 1st put')

    response = await te.put({ a: 1 }, 'userX', undefined, undefined, response.meta.eTag)
    t.equal(state.storage.data.entityMeta.timeline.length, 1, 'should still have 1 entry in timeline after 2nd put with same value but different userID')

    response = await te.put({ a: 2 }, 'userY', undefined, undefined, response.meta.eTag)
    t.equal(state.storage.data.entityMeta.timeline.length, 2, 'should have 2 entries in timeline after 3rd put with different value')

    await te.put({ a: 2 }, 'userZ', undefined, undefined, response.meta.eTag)
    t.equal(state.storage.data.entityMeta.timeline.length, 2, 'should still have 2 entries in timeline after 4th put')

    t.end()
  })
})

test('TemporalEntity delete and undelete', async (t) => {
  const state = getStateMock()
  const te = new TemporalEntity(state, env, '*', '*', 'testIDString')
  const { data } = state.storage
  let response

  t.test('delete', async (t) => {
    response = await te.put({ a: 1 }, 'userW')
    t.equal(state.storage.data.entityMeta.timeline.length, 1, 'should have 1 entry in timeline after 1st put')

    response = await te.put({ a: 2 }, 'userX', undefined, undefined, response.meta.eTag)
    t.equal(state.storage.data.entityMeta.timeline.length, 2, 'should now have 2 entries in timeline after 2nd put')

    response = await te.delete('userY')
    t.equal(state.storage.data.entityMeta.timeline.length, 3, 'should have 3 entries in timeline after delete')

    const validFrom1 = data.entityMeta.timeline[0]
    const validFrom2 = data.entityMeta.timeline[1]
    const validFrom3 = data.entityMeta.timeline[2]
    const snapshot1 = data[`snapshot-${validFrom1}`]
    const snapshot2 = data[`snapshot-${validFrom2}`]
    const snapshot3 = data[`snapshot-${validFrom3}`]

    t.equal(snapshot1.meta.validTo, snapshot2.meta.validFrom, 'second snapshot should start where first snapshot ends')
    t.equal(snapshot2.meta.validTo, snapshot3.meta.validFrom, 'third snapshot should start where second snapshot ends')
    t.equal(snapshot3.meta.validTo, TemporalEntity.END_OF_TIME, 'third snapshot should end at the end of time')
    t.deepEqual(snapshot3.value, { }, 'the value of the last snapshot should be an empty object')
    t.deepEqual(snapshot3.meta.previousValues, snapshot2.value, 'the previousValues should be the value of the snapshot before the delete')

    t.end()
  })

  t.test('undelete', async (t) => {
    response = await te.undelete('userY')

    const validFrom2 = data.entityMeta.timeline[1]
    const validFrom3 = data.entityMeta.timeline[2]
    const validFrom4 = data.entityMeta.timeline[3]
    const snapshot2 = data[`snapshot-${validFrom2}`]
    const snapshot3 = data[`snapshot-${validFrom3}`]
    const snapshot4 = data[`snapshot-${validFrom4}`]

    t.equal(snapshot3.meta.validTo, snapshot4.meta.validFrom, 'fourth snapshot should start where third snapshot ends')
    t.deepEqual(snapshot4.value, snapshot2.value, 'the value after undelete should equal the value before delete')
    t.deepEqual(snapshot4.meta.previousValues, { a: undefined }, 'the previousValues should be the diff with the current value')

    t.end()
  })
})

test('TemporalEntity auto-incremented validFrom', async (t) => {
  t.test('auto-incremented validFrom', async (t) => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '*', '*', 'testIDString')
    const validFromISOString = '2200-01-01T00:00:00.000Z'
    const lastValidFromDate = new Date(validFromISOString)
    const newValidFromDate = new Date(lastValidFromDate.getTime() + 1)  // 1 millisecond later
    const newValidFromISOString = newValidFromDate.toISOString()

    const response = await te.put({ a: 1 }, 'userY', validFromISOString)
    await te.put({ a: 2 }, 'userZ', undefined, undefined, response.meta.eTag)
    const [result, status] = await te.get()
    t.equal(result.meta.validFrom, newValidFromISOString, 'should be 1ms later')

    t.end()
  })
})

test('deep object put and patch', async (t) => {
  t.test('deep patching', async (t) => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '*', '*', 'testIDString')
    const o = { a: 2000, o: { a: 1, b: 2, children: [1, 'a', new Date()] } }

    const response = await te.put(o, 'userX')
    const [result, status] = await te.get()
    t.deepEqual(result.value, o, 'should get back same value')

    const response2 = await te.patch(
      {
        delta: { o: { a: 2, c: 3 } },
        userID: 'userX',
        validFrom: '2200-01-01T00:00:00.000Z',
      },
      response.meta.eTag,
    )
    const o2 = structuredClone(o)
    o2.o.a = 2
    o2.o.c = 3
    t.deepEqual(response2.value, o2, 'should get back deeply patched value')

    const response3 = await te.patch(
      {
        delta: { o: { children: { 3: 'pushed' } } },
        userID: 'userX',
        validFrom: '2200-01-02T00:00:00.000Z',
      },
      response2.meta.eTag,
    )
    const o3 = structuredClone(o2)
    o3.o.children.push('pushed')
    t.deepEqual(response3.value, o3, 'should get back deeply patched value for array')

    t.end()
  })
})

test('get and getEntityMeta with correct eTag returns a 304', async (t) => {
  t.test('auto-incremented validFrom', async (t) => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '*', '*', 'testIDString')

    const response = await te.put({ a: 1 }, 'userY')
    const [result, status] = await te.get()
    t.equal(status, 200, 'should be 200')
    t.deepEqual(result.value, { a: 1 }, 'should be { a: 1 }')

    const [result2, status2] = await te.get(response.meta.eTag)
    t.equal(status2, 304, 'should be 304')
    t.equal(result2, undefined, 'should be undefined')

    const [result3, status3] = await te.getEntityMeta(response.meta.eTag)
    t.equal(status3, 304, 'should be 304')
    t.equal(result3, undefined, 'should be undefined')

    t.end()
  })
})

test('TemporalEntity debouncing', async (t) => {
  t.test('debouncing', async (t) => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '*', '*', 'testIDString')

    const firstCurrent = await te.put({ a: 1 }, 'userY')
    const middleCurrent = await te.put({ a: 2 }, 'userY', undefined, undefined, firstCurrent.meta.eTag)
    t.equal(
      state.storage.data.entityMeta.timeline.length,
      1,
      'should still have 1 entry in timeline after 2th put with different value and same userID',
    )
    const [{ meta, value }, status] = await te.get()
    t.deepEqual(value, { a: 2 }, 'should get back last value')
    t.equal(meta.validFrom, firstCurrent.meta.validFrom, 'should get back first validFrom')
    const pv = Object.create(null)
    pv.a = undefined
    t.deepEqual(meta.previousValues, pv, 'should get back previousValues like it was the first put')

    const secondCurrent = await te.put({ a: 3 }, 'userZ', undefined, undefined, middleCurrent.meta.eTag)
    await te.put({ a: 4 }, 'userZ', undefined, undefined, secondCurrent.meta.eTag)
    t.equal(
      state.storage.data.entityMeta.timeline.length,
      2,
      'should have 2 entries in timeline after 3th put with a different userID',
    )
    const [newCurrent, newStatus] = await te.get()
    t.deepEqual(newCurrent.value, { a: 4 }, 'should get back last value')
    t.equal(newCurrent.meta.validFrom, secondCurrent.meta.validFrom, 'should get back second validFrom')

    const newValidFromDate = new Date(new Date(newCurrent.meta.validFrom).getTime() + 61 * 60 * 1000) // 61 minutes later
    await te.put({ a: 5 }, 'userZ', newValidFromDate.toISOString(), undefined, newCurrent.meta.eTag)
    t.equal(
      state.storage.data.entityMeta.timeline.length,
      3,
      'should have 3 entries after 4th put with same userID but 61 minutes in the future',
    )
    const [newCurrent3, newStatus3] = await te.get()
    t.deepEqual(newCurrent3.value, { a: 5 }, 'should get back last value')

    t.end()
  })

  test('TemporalEntity granularity', async (t) => {
    t.test('granularity="sec"', async (t) => {
      const state = getStateMock()
      const te = new TemporalEntity(state, env, '***test-granularity***', 'v1', 'testIDString')

      let response = await te.put({ a: 1 }, 'userX')

      let newValidFromDate = new Date(new Date(response.meta.validFrom).getTime() + 1500) // 1500 ms later
      response = await te.put({ a: 2 }, 'userX', newValidFromDate.toISOString(), undefined, response.meta.eTag)
      t.equal(
        state.storage.data.entityMeta.timeline.length,
        2,
        'should have 2 entries after 2nd put with same userID but 1500 ms in the future',
      )

      newValidFromDate = new Date(new Date(response.meta.validFrom).getTime() + 500) // 500 ms later
      response = await te.put({ a: 2 }, 'userX', newValidFromDate.toISOString(), undefined, response.meta.eTag)
      t.equal(
        state.storage.data.entityMeta.timeline.length,
        2,
        'should still have 2 entries after 2nd put with same userID but only 500 ms in the future',
      )

      t.end()
    })
  })

  test('TemporalEntity PUT fails with old ETag', async (t) => {
    t.test('optimistic concurrency', async (t) => {
      const state = getStateMock()
      const te = new TemporalEntity(state, env, '*', '*', 'testIDString')

      const response3 = await te.put({ a: 1, b: 2, c: 3, d: 4 }, 'userY', '2200-01-01T00:00:00.000Z')
      t.equal(state.storage.data.entityMeta.timeline.length, 1, 'should have 1 entry in timeline after 1st put')

      const response4 = await te.put({ a: 10, b: 2, c: 3, d: 4 }, 'userY', '2200-01-02T00:00:00.000Z', undefined, response3.meta.eTag)
      t.equal(state.storage.data.entityMeta.timeline.length, 2, 'should have 2 entries in timeline after 2nd put')

      try {
        await te.put({ a: 1, b: 2, c: 25, d: 40 }, 'userY', '2200-01-05T00:00:00.000Z', undefined, response3.meta.eTag)
        t.fail('async thrower did not throw')
      } catch (e) {
        t.equal(
          e.message,
          'If-Match does not match this TemporalEntity\'s current ETag',
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
