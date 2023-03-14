/* eslint-disable no-unused-vars */
/* eslint-disable import/no-extraneous-dependencies */

// 3rd party imports
import { describe, it, expect, assert } from 'vitest'

// monorepo imports
import { getStateMock, getEnvMock, initFetchPolyfill } from '@transformation-dev/cloudflare-do-testing-utils'  // TODO: Remove all of this here and in the package because we don't need it with miniflare vitest integration

// local imports
// import { TemporalEntity } from '../index.mjs'
import { TemporalEntity } from '../src/index.js'

// initialize imports
// const env = getEnvMock()  // defaults to DEBUG: 'blueprint:*'. call with getEnvMock({ DEBUG: 'something:*' }) to change debug scope filter
const env = getEnvMock({})
// initFetchPolyfill()

describe('TemporalEntity accessing static properties in subclass', async () => {  // TODO: this test needs to move to the blueprint suite once TemporalEntityBase is in a package
  it('should have bogus property from subclass', () => {
    expect(TemporalEntity.types['***test-type-in-subclass***']['***test-property-in-type-in-subclass***']).toBeTruthy()
  })
})

describe('TemporalEntity put(), patch(), and rehydrate', async () => {
  const state = getStateMock()
  const te = new TemporalEntity(state, env, '*', '*', 'testIDString')

  it('should allow put() with only value and userID', async () => {
    await te.put({ a: 1, b: 2 }, 'user1')
    const [{ meta, value }, status] = await te.get()
    expect(value).toMatchObject({ a: 1, b: 2 })
    expect(meta.userID).toBe('user1')
    expect(meta.previousValues).toMatchObject({ a: undefined, b: undefined })
    assert(meta.validFrom <= new Date().toISOString)
    expect(meta.validTo, TemporalEntity.END_OF_TIME, 'should initialize validTo with TemporalEntity.END_OF_TIME')
    expect(meta).to.not.haveOwnProperty('impersonatorID')
  })

  it('should allow patch() with validFrom and impersonatorID (note, this also tests put())', async () => {
    const lastValidFromISOString = state.storage.data['testIDString/entityMeta'].timeline.at(-1)
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
    expect(value).toEqual({ b: 3, c: 4 })
    expect(meta.impersonatorID).toBe('impersonator1')
    expect(state.storage.data['testIDString/entityMeta'].timeline.at(-1)).toBe(newValidFromISOString)
    expect(state.storage.data['testIDString/entityMeta'].timeline.at(-2)).toBe(lastValidFromISOString)
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(2)
  })

  it('allow rehydration with old state', async () => {
    const te2 = new TemporalEntity(state, env, '*', '*', 'testIDString')
    const [{ meta, value }, status] = await te2.get()
    expect(value).toEqual({ b: 3, c: 4 })
  })
})

describe('TemporalEntity END_OF_TIME', async () => {
  it('should have END_OF_TIME', () => {
    expect(TemporalEntity.END_OF_TIME).toBe('9999-01-01T00:00:00.000Z')
  })
})

describe('TemporalEntity validation', async () => {
  it('should throw on missing type', async () => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, undefined, 'v1', 'testIDString')
    try {
      await te.put({ a: 100 }, 'userX')
      assert(false)
    } catch (e) {
      expect(e.message).toMatch('Entity type, undefined, not found')
      expect(e.status).toBe(404)
    }
  })

  it('should throw on unknown type', async () => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '***unknown***', 'v1', 'testIDString')
    try {
      await te.put({ a: 100 }, 'userX')
      assert(false)
    } catch (e) {
      expect(e.message).toMatch('Entity type, ***unknown***, not found')
      expect(e.status).toBe(404)
    }
  })

  const state = getStateMock()
  const te = new TemporalEntity(state, env, '*', '*', 'testIDString')

  it('should throw on PATCH with no prior value', async () => {
    try {
      await te.patch({
        delta: { a: 100 },
        userID: 'userX',
      })
      assert(false)
    } catch (e) {
      expect(e.message).toMatch('cannot call TemporalEntity PATCH when there is no prior value')
      expect(e.status).toBe(400)
    }
  })

  it('should throw on PUT with no value', async () => {
    try {
      await te.put(undefined, 'userX')
      assert(false)
    } catch (e) {
      expect(e.message).toMatch('body.value field required by TemporalEntity PUT is missing')
      expect(e.status).toBe(400)
    }
  })

  it('should throw when userID is missing', async () => {
    try {
      await te.put({ a: 10 })
      assert(false)
    } catch (e) {
      expect(e.message).toMatch('userID required by TemporalEntity operation is missing')
      expect(e.status).toBe(400)
    }
  })

  it('should throw if passed in validFrom is before prior validFrom', async () => {
    try {
      const response = await te.put({ a: 100 }, 'userX')
      await te.put({ a: 1000 }, 'userX', '1999-01-01T00:00:00.000Z', undefined, response.meta.eTag)
      assert(false)
    } catch (e) {
      expect(e.message).toMatch('the validFrom for a TemporalEntity update is not greater than the prior validFrom')
      expect(e.status).toBe(400)
    }
  })

  it('should throw if ETag is not passed in', async () => {
    try {
      const response = await te.put({ a: 1000 }, 'userX')
      assert(false)
    } catch (e) {
      expect(e.message).toMatch('required ETag header for TemporalEntity PUT is missing')
      expect(e.status).toBe(428)
    }
  })

  it('should throw if ETag does not match current eTag', async () => {
    try {
      const response2 = await te.patch(
        {
          delta: { a: 2000 },
          userID: 'userX',
        },
        '0123456789abcdef',  // random eTag so as not to match
      )
      assert(false)
    } catch (e) {
      expect(e.message).toMatch('If-Match does not match this TemporalEntity\'s current ETag')
      expect(e.status).toBe(412)
    }
  })
})

describe('TemporalEntity DAG', async () => {
  it('should not throw with valid DAG matching schema', async () => {
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
    try {
      const response = await te.put(value, 'userW')
      expect(response.value).toEqual(value)
    } catch (e) {
      assert(false)
    }
  })

  it('should throw on invalid DAG because of cycle', async () => {
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
    try {
      const response = await te.put(value, 'userW')
      assert(false)
    } catch (e) {
      expect(e.message).toMatch('contains duplicate ids')
    }
  })

  it('should throw on invalid DAG because of duplicate sibling', async () => {
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
    try {
      const response = await te.put(value, 'userW')
      assert(false)
    } catch (e) {
      expect(e.message).toMatch('contain duplicate ids')
    }
  })

  it('should throw on valid DAG but not matching schema', async () => {
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
    try {
      const response = await te.put(value, 'userW')
      assert(false)
    } catch (e) {
      expect(e.message).toMatch('Schema validation failed')
    }
  })
})

describe('TemporalEntity supressPreviousValues', async () => {
  it('should not have previousValues', async () => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '***test-supress-previous-values***', 'v1', 'testIDString')
    let response = await te.put({ a: 1 }, 'userW')
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(1)
    response = await te.put({ a: 2 }, 'userX', undefined, undefined, response.meta.eTag)
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(2)
    expect(response.meta.previousValues).toBeUndefined()
  })
})

describe('TemporalEntity idempotency', async () => {
  it('should not create new snapshots when input is idempotent', async () => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '*', '*', 'testIDString')
    let response = await te.put({ a: 1 }, 'userW')
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(1)
    response = await te.put({ a: 1 }, 'userX', undefined, undefined, response.meta.eTag)
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(1)
    response = await te.put({ a: 2 }, 'userY', undefined, undefined, response.meta.eTag)
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(2)
    await te.put({ a: 2 }, 'userZ', undefined, undefined, response.meta.eTag)
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(2)
  })
})

describe('TemporalEntity delete and undelete', async () => {
  const state = getStateMock()
  const te = new TemporalEntity(state, env, '*', '*', 'testIDString')
  const { data } = state.storage
  let response

  it('should allow delete', async () => {
    response = await te.put({ a: 1 }, 'userW')
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(1)
    response = await te.put({ a: 2 }, 'userX', undefined, undefined, response.meta.eTag)
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(2)
    response = await te.delete('userY')
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(3)
    const validFrom1 = data['testIDString/entityMeta'].timeline[0]
    const validFrom2 = data['testIDString/entityMeta'].timeline[1]
    const validFrom3 = data['testIDString/entityMeta'].timeline[2]
    const snapshot1 = data[`testIDString/snapshot/${validFrom1}`]
    const snapshot2 = data[`testIDString/snapshot/${validFrom2}`]
    const snapshot3 = data[`testIDString/snapshot/${validFrom3}`]
    expect(snapshot1.meta.validTo).toBe(snapshot2.meta.validFrom)
    expect(snapshot2.meta.validTo).toBe(snapshot3.meta.validFrom)
    expect(snapshot3.meta.validTo).toBe(TemporalEntity.END_OF_TIME)
    expect(snapshot3.value).toEqual(snapshot2.value)
    expect(snapshot3.meta.previousValues).toEqual({})
  })

  it('should allow undelete', async () => {
    response = await te.patchUndelete({ userID: 'userY' })
    const validFrom2 = data['testIDString/entityMeta'].timeline[1]
    const validFrom3 = data['testIDString/entityMeta'].timeline[2]
    const validFrom4 = data['testIDString/entityMeta'].timeline[3]
    const snapshot2 = data[`testIDString/snapshot/${validFrom2}`]
    const snapshot3 = data[`testIDString/snapshot/${validFrom3}`]
    const snapshot4 = data[`testIDString/snapshot/${validFrom4}`]
    expect(snapshot3.meta.validTo).toBe(snapshot4.meta.validFrom)
    expect(snapshot4.value).toEqual(snapshot2.value)
    expect(snapshot4.meta.previousValues).toEqual({})
  })
})

describe('TemporalEntity auto-incremented validFrom', async () => {
  it('should have validFrom 1ms later than requested', async () => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '*', '*', 'testIDString')
    const validFromISOString = '2200-01-01T00:00:00.000Z'
    const lastValidFromDate = new Date(validFromISOString)
    const newValidFromDate = new Date(lastValidFromDate.getTime() + 1)  // 1 millisecond later
    const newValidFromISOString = newValidFromDate.toISOString()
    const response = await te.put({ a: 1 }, 'userY', validFromISOString)
    await te.put({ a: 2 }, 'userZ', undefined, undefined, response.meta.eTag)
    const [result, status] = await te.get()
    expect(result.meta.validFrom).toBe(newValidFromISOString)
  })
})

describe('deep object put and patch', async () => {
  it('should allow deep patching', async () => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '*', '*', 'testIDString')
    const o = { a: 2000, o: { a: 1, b: 2, children: [1, 'a', new Date()] } }
    const response = await te.put(o, 'userX')
    const [result, status] = await te.get()
    expect(result.value).toEqual(o)
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
    expect(response2.value).toEqual(o2)
    const inner = Object.create(null)
    inner.a = 1
    inner.c = undefined
    const pv = Object.create(null)
    pv.o = inner
    expect(response2.meta.previousValues).toEqual(pv)
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
    expect(response3.value).toEqual(o3)
  })
})

describe('304 behaviore for get and getEntityMeta', async () => {
  it('should return 304 status code and no body with correct eTag or ifModifiedSince', async () => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '*', '*', 'testIDString')
    const response = await te.put({ a: 1 }, 'userY')
    const [result, status] = await te.get()
    const lastValidFrom = result.meta.validFrom
    const ifModifiedSince1msEarlier = new Date(new Date(lastValidFrom).valueOf() - 1).toISOString()
    expect(status).toBe(200)
    expect(result.value).toEqual({ a: 1 })
    const [result2, status2] = await te.get({ ifModifiedSinceISOString: lastValidFrom })
    expect(status2).toBe(304)
    expect(result2).toBeUndefined()
    const [result5, status5] = await te.get({ ifModifiedSince: ifModifiedSince1msEarlier })
    expect(status5).toBe(200)
    expect(result5).not.toBeUndefined()
    const [result3, status3] = await te.getEntityMeta(lastValidFrom)
    expect(status3).toBe(304)
    expect(result3).toBeUndefined()
    const [result4, status4] = await te.getEntityMeta(ifModifiedSince1msEarlier)
    expect(status4).toBe(200)
    expect(result4).not.toBeUndefined()
  })
})

describe('TemporalEntity debouncing', async () => {
  it('should not create new snapshots when updated within granularity', async () => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '*', '*', 'testIDString')
    const firstCurrent = await te.put({ a: 1 }, 'userY')
    const middleCurrent = await te.put({ a: 2 }, 'userY', undefined, undefined, firstCurrent.meta.eTag)
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(1)
    const [{ meta, value }, status] = await te.get()
    expect(value).toEqual({ a: 2 })
    expect(meta.validFrom, firstCurrent.meta.validFrom, 'should get back first validFrom')
    const pv = Object.create(null)
    pv.a = undefined
    expect(meta.previousValues).toEqual(pv)
    const secondCurrent = await te.put({ a: 3 }, 'userZ', undefined, undefined, middleCurrent.meta.eTag)
    await te.put({ a: 4 }, 'userZ', undefined, undefined, secondCurrent.meta.eTag)
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(2)
    const [newCurrent, newStatus] = await te.get()
    expect(newCurrent.value).toEqual({ a: 4 })
    expect(newCurrent.meta.validFrom).toBe(secondCurrent.meta.validFrom)
    const newValidFromDate = new Date(new Date(newCurrent.meta.validFrom).getTime() + 61 * 60 * 1000) // 61 minutes later
    await te.put({ a: 5 }, 'userZ', newValidFromDate.toISOString(), undefined, newCurrent.meta.eTag)
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(3)
    const [newCurrent3, newStatus3] = await te.get()
    expect(newCurrent3.value).toEqual({ a: 5 })
  })
})

describe('TemporalEntity granularity', async () => {
  it('should not debounce when update is outside of granularity', async () => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '***test-granularity***', 'v1', 'testIDString')
    let response = await te.put({ a: 1 }, 'userX')
    let newValidFromDate = new Date(new Date(response.meta.validFrom).getTime() + 1500) // 1500 ms later
    response = await te.put({ a: 2 }, 'userX', newValidFromDate.toISOString(), undefined, response.meta.eTag)
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(2)
    newValidFromDate = new Date(new Date(response.meta.validFrom).getTime() + 500) // 500 ms later
    response = await te.put({ a: 2 }, 'userX', newValidFromDate.toISOString(), undefined, response.meta.eTag)
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(2)
  })
})

describe('TemporalEntity PUT with old ETag', async () => {
  it('should throw if old eTag is used', async () => {
    const state = getStateMock()
    const te = new TemporalEntity(state, env, '*', '*', 'testIDString')
    const response3 = await te.put({ a: 1, b: 2, c: 3, d: 4 }, 'userY', '2200-01-01T00:00:00.000Z')
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(1)
    const response4 = await te.put({ a: 10, b: 2, c: 3, d: 4 }, 'userY', '2200-01-02T00:00:00.000Z', undefined, response3.meta.eTag)
    expect(state.storage.data['testIDString/entityMeta'].timeline.length).toBe(2)
    try {
      await te.put({ a: 1, b: 2, c: 25, d: 40 }, 'userY', '2200-01-05T00:00:00.000Z', undefined, response3.meta.eTag)
      assert(false)
    } catch (e) {
      expect(e.message).toMatch('If-Match does not match this TemporalEntity\'s current ETag')
      expect(e.status).toBe(412)
      expect(e.body.value).toEqual({ a: 10, b: 2, c: 3, d: 4 })
      expect(e.body.meta.validFrom).toBe('2200-01-02T00:00:00.000Z')
      expect(e.body.error.status).toBe(412)
    }
  })
})
