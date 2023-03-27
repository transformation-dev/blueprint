// 3rd party imports
import { describe, it, expect, assert } from 'vitest'

// monorepo imports
import { requestOutResponseIn } from '@transformation-dev/cloudflare-do-utils'

// local imports
import { DurableAPI, TemporalEntity } from '../src/index.js'

// initialize imports
// const describe = setupMiniflareIsolatedStorage()  // intentionally not using this describe because I don't want isolated storage between my it/test blocks
// eslint-disable-next-line no-undef
const env = getMiniflareBindings()
// env.DEBUG = 'blueprint:*'
env.DEBUG = 'blueprint:temporal-entity'
// env.DEBUG = 'nothing'

let lastValidFrom
let idString
let baseUrl = 'http://fake.host'
let url = `${baseUrl}/*/*`

describe('TemporalEntity put(), patch(), and rehydrate', async () => {
  let state
  let stub  // if stub is left undefined, then fetch is used instead of stub.fetch
  if (process?.env?.VITEST_BASE_URL != null) {
    baseUrl = process.env.VITEST_BASE_URL
  } else {
    const id = env.DO_API.newUniqueId()
    // eslint-disable-next-line no-undef
    state = await getMiniflareDurableObjectState(id)
    // stub = await env.DO_API.get(id)  // this is how Cloudflare suggests getting the stub. However, doing it the way below allows vitest --coverage to work
    stub = new DurableAPI(state, env, id.toString())
  }

  it('should allow POST with only value and userID', async () => {
    const options = {
      method: 'POST',
      body: { value: { a: 1, b: 2 }, userID: 'userW' },
    }
    const response = await requestOutResponseIn(url, options, stub, state)

    const { meta, value, warnings } = response.content
    idString = response.content.idString
    lastValidFrom = meta.validFrom
    expect(value).toMatchObject({ a: 1, b: 2 })
    expect(meta.userID).toBe('userW')
    expect(meta.previousValues).toMatchObject({ a: undefined, b: undefined })
    assert(meta.validFrom <= new Date().toISOString)
    expect(meta.validTo, TemporalEntity.END_OF_TIME, 'should initialize validTo with TemporalEntity.END_OF_TIME')
    expect(meta).to.not.haveOwnProperty('impersonatorID')
  })

  it('should allow patch() with validFrom and impersonatorID (note, this also tests put())', async () => {
    const lastValidFromISOString = lastValidFrom
    const lastValidFromDate = new Date(lastValidFromISOString)
    const newValidFromDate = new Date(lastValidFromDate.getTime() + 1)  // 1 millisecond later
    const newValidFromISOString = newValidFromDate.toISOString()

    url += `/${idString}`
    // const fromGet = await te.get()
    const options = {
      method: 'PATCH',
      body: {
        delta: { a: undefined, b: 3, c: 4 },
        userID: 'user2',
        validFrom: newValidFromISOString,
        impersonatorID: 'impersonator1',
      },
      headers: {
        'If-Unmodified-Since': lastValidFrom,
      },
    }

    const response = await requestOutResponseIn(url, options, stub, state)
    const { meta, value, warnings } = response.content

    expect(value).toEqual({ b: 3, c: 4 })
    expect(meta.impersonatorID).toBe('impersonator1')
    // storage operation expects/asserts to only run in miniflare (aka not live over http)
    if (process?.env?.VITEST_BASE_URL == null) {
      const storage = await state.storage.list()
      const entityMeta = storage.get(`${idString}/entityMeta`)
      expect(entityMeta.timeline.at(-1)).toBe(newValidFromISOString)
      expect(entityMeta.timeline.at(-2)).toBe(lastValidFromISOString)
      expect(entityMeta.timeline.length).toBe(2)
    }
  })
})

describe('TemporalEntity END_OF_TIME', async () => {
  it('should have END_OF_TIME', () => {
    expect(TemporalEntity.END_OF_TIME).toBe('9999-01-01T00:00:00.000Z')
  })
})

describe('TemporalEntity validation', async () => {
  let state
  let stub  // if stub is left undefined, then fetch is used instead of stub.fetch
  if (process?.env?.VITEST_BASE_URL != null) {
    baseUrl = process.env.VITEST_BASE_URL
  } else {
    const id = env.DO_API.newUniqueId()
    // eslint-disable-next-line no-undef
    state = await getMiniflareDurableObjectState(id)
    stub = new DurableAPI(state, env, id.toString())
  }

  it('should return error on missing type', async () => {
    const options = {
      method: 'POST',
      body: { value: { a: 1, b: 2 }, userID: 'userW' },
    }
    url = `${baseUrl}//*`
    const response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(404)
    expect(response.content.error.message).toMatch('Version undefined for type * not found')
  })

  it('should return error on unknown type', async () => {
    const options = {
      method: 'POST',
      body: { value: { a: 1, b: 2 }, userID: 'userW' },
    }
    url = `${baseUrl}/***unknown***/*`
    const response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(404)
    expect(response.content.error.message).toMatch('Type ***unknown*** not found')
  })

  it('should return error on PATCH with no prior value', async () => {
    const options = {
      method: 'PATCH',
      body: {
        delta: { a: 100 },
        userID: 'userX',
      },
    }
    url = `${baseUrl}/*/*`
    const response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(400)
    expect(response.content.error.message).toMatch('cannot call TemporalEntity PATCH when there is no prior value')
  })

  it('should return error on PUT with no value', async () => {
    const options = {
      method: 'PUT',
      body: {
        userID: 'userX',
      },
    }
    url = `${baseUrl}/*/*`
    const response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(400)
    expect(response.content.error.message).toMatch('body.value field required by TemporalEntity PUT is missing')
  })

  it('should return error when userID is missing', async () => {
    const options = {
      method: 'PUT',
      body: {
        value: { a: 100 },
      },
    }
    url = `${baseUrl}/*/*`
    const response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(400)
    expect(response.content.error.message).toMatch('userID required by TemporalEntity operation is missing')
  })

  it('should return error if validFrom is prior to latest', async () => {
    let options = {
      method: 'PUT',
      body: {
        value: { a: 100 },
        userID: 'userX',
      },
    }
    url = `${baseUrl}/*/*/${idString}`
    let response = await requestOutResponseIn(url, options, stub, state)
    lastValidFrom = response.content.meta.validFrom
    options = {
      method: 'PUT',
      body: {
        value: { a: 200 },
        userID: 'userX',
        validFrom: '1999-01-01T00:00:00.000Z',
      },
      headers: {
        'If-Unmodified-Since': lastValidFrom,
      },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(400)
    expect(response.content.error.message).toMatch('the validFrom for a TemporalEntity update is not greater than the prior validFrom')
  })

  it('should return error if If-Unmodified-Since is missing', async () => {
    const options = {
      method: 'PUT',
      body: {
        value: { a: 300 },
        userID: 'userX',
      },
    }
    const response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(428)
    expect(response.content.error.message).toMatch('required If-Unmodified-Since header for TemporalEntity PUT is missing')
  })

  it('should return error if If-Modified-Since is prior to latest', async () => {
    const options = {
      method: 'PATCH',
      body: {
        delta: { a: 2000 },
        userID: 'userX',
      },
      headers: {
        'If-Unmodified-Since': new Date(new Date().valueOf() - 1000).toISOString(),
      },
    }
    const response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(412)
    expect(response.content.error.message).toMatch('If-Unmodified-Since is earlier than the last time this TemporalEntity was modified')
  })
})

// describe('TemporalEntity DAG', async () => {
//   it.todo('should not throw with valid DAG matching schema', async () => {
//     const state = getStateMock()
//     const te = new TemporalEntity(state, env, '***test-dag***', 'v1', 'testIDString')
//     const dag = {
//       id: '1',
//       children: [
//         {
//           id: '2',
//         },
//       ],
//     }
//     const value = {
//       a: 1,
//       dag,
//     }
//     try {
//       const response = await te.put(value, 'userW')
//       expect(response.value).toEqual(value)
//     } catch (e) {
//       assert(false)
//     }
//   })

//   it.todo('should throw on invalid DAG because of cycle', async () => {
//     const state = getStateMock()
//     const te = new TemporalEntity(state, env, '***test-dag***', 'v1', 'testIDString')
//     const dag = {
//       id: '1',
//       children: [
//         {
//           id: '1',
//         },
//       ],
//     }
//     const value = {
//       a: 1,
//       dag,
//     }
//     try {
//       const response = await te.put(value, 'userW')
//       assert(false)
//     } catch (e) {
//       expect(e.message).toMatch('contains duplicate ids')
//     }
//   })

//   it.todo('should throw on invalid DAG because of duplicate sibling', async () => {
//     const state = getStateMock()
//     const te = new TemporalEntity(state, env, '***test-dag***', 'v1', 'testIDString')
//     const dag = {
//       id: '1',
//       children: [
//         {
//           id: '2',
//         },
//         {
//           id: '2',
//         },
//       ],
//     }
//     const value = {
//       a: 1,
//       dag,
//     }
//     try {
//       const response = await te.put(value, 'userW')
//       assert(false)
//     } catch (e) {
//       expect(e.message).toMatch('contain duplicate ids')
//     }
//   })

//   it.todo('should throw on valid DAG but not matching schema', async () => {
//     const state = getStateMock()
//     const te = new TemporalEntity(state, env, '***test-dag***', 'v1', 'testIDString')
//     const dag = {
//       id: '1',
//       children: [
//         {
//           id: '2',
//         },
//       ],
//     }
//     const value = {
//       a: 'string when a number is expected',
//       dag,
//     }
//     try {
//       const response = await te.put(value, 'userW')
//       assert(false)
//     } catch (e) {
//       expect(e.message).toMatch('Schema validation failed')
//     }
//   })
// })

// describe('TemporalEntity supressPreviousValues', async () => {
//   let state
//   let stub  // if stub is left undefined, then fetch is used instead of stub.fetch
//   if (process?.env?.VITEST_BASE_URL != null) {
//     baseUrl = process.env.VITEST_BASE_URL
//   } else {
//     const id = env.DO_API.newUniqueId()
//     // eslint-disable-next-line no-undef
//     state = await getMiniflareDurableObjectState(id)
//     stub = new DurableAPI(state, env, id.toString())
//   }

//   it.todo('should not have previousValues', async () => {  // TODO: Re-enable and fix once we merge the type system in TransactionDOWrapper with the one in TemporalEntity
//     const options = {
//       method: 'POST',
//       body: { value: { a: 1 }, userID: 'userX' },
//     }
//     url = `${baseUrl}/***test-supress-previous-values***/v1`
//     let response = await requestOutResponseIn(url, options, stub, state)
//     console.log('1st response.content: %O', response.content)
//     expect(response.status).toBe(200)
//     let { meta, value } = response.content
//     expect(meta.previousValues).toBeUndefined()
//     idString = response.content.idString
//     // storage operation expects/asserts to only run in miniflare (aka not live over http)
//     if (process?.env?.VITEST_BASE_URL == null) {
//       const storage = await state.storage.list()
//       const entityMeta = storage.get(`${idString}/entityMeta`)
//       expect(entityMeta.timeline.length).toBe(1)
//     }
//     response = await requestOutResponseIn(url, options, stub, state)
//     console.log('2nd response.content: %O', response.content)
//     expect(response.status).toBe(200)
//     meta = response.content.meta
//     expect(meta.previousValues).toBeUndefined()
//     idString = response.content.idString
//     // storage operation expects/asserts to only run in miniflare (aka not live over http)
//     if (process?.env?.VITEST_BASE_URL == null) {
//       const storage = await state.storage.list()
//       const entityMeta = storage.get(`${idString}/entityMeta`)
//       expect(entityMeta.timeline.length).toBe(2)
//     }
//   })
// })

// it.todo('should not have previousValues', async () => {
//   const state = getStateMock()
//   const te = new TemporalEntity(state, env, '***test-supress-previous-values***', 'v1', 'testIDString')
//   let response = await te.put({ a: 1 }, 'userW')
//   expect(entityMeta.timeline.length).toBe(1)
//   response = await te.put({ a: 2 }, 'userX', undefined, undefined, response.meta.validFrom)
//   expect(entityMeta.timeline.length).toBe(2)
//   expect(response.meta.previousValues).toBeUndefined()
// })

describe('TemporalEntity idempotency', async () => {
  let state
  let stub  // if stub is left undefined, then fetch is used instead of stub.fetch
  if (process?.env?.VITEST_BASE_URL != null) {
    baseUrl = process.env.VITEST_BASE_URL
  } else {
    const id = env.DO_API.newUniqueId()
    // eslint-disable-next-line no-undef
    state = await getMiniflareDurableObjectState(id)
    stub = new DurableAPI(state, env, id.toString())
  }

  it('should not create new snapshots when input is idempotent', async () => {
    url = `${baseUrl}/*/*`
    let options = {
      method: 'POST',
      body: { value: { a: 1 }, userID: 'userX' },
    }
    let response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(201)
    expect(response.content.meta.validFrom).to.be.a('string')

    idString = response.content.idString
    lastValidFrom = response.content.meta.validFrom
    const entityMetaUrl = `${url}/${idString}/entity-meta/`
    response = await requestOutResponseIn(entityMetaUrl, undefined, stub, state)
    expect(response.content.timeline.length).toBe(1)

    url = `${url}/${idString}`
    options = {
      method: 'PUT',
      body: { value: { a: 1 }, userID: 'userY' },  // Note, does not have to be the same userID to be idempotent. Just the same value.
      headers: { 'If-Unmodified-Since': lastValidFrom },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(200)
    expect(response.content.meta.validFrom).to.be.a('string')
    response = await requestOutResponseIn(entityMetaUrl, undefined, stub, state)
    expect(response.content.timeline.length).toBe(1)

    options = {
      method: 'PUT',
      body: { value: { a: 2 }, userID: 'userY' },  // Same userID but different value
      headers: { 'If-Unmodified-Since': lastValidFrom },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(200)
    expect(response.content.meta.validFrom).to.be.a('string')
    lastValidFrom = response.content.meta.validFrom
    response = await requestOutResponseIn(entityMetaUrl, undefined, stub, state)
    expect(response.content.timeline.length).toBe(2)

    options = {
      method: 'PUT',
      body: { value: { a: 2 }, userID: 'userZ' },  // Different userID but same value
      headers: { 'If-Unmodified-Since': lastValidFrom },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(200)
    expect(response.content.meta.validFrom).to.be.a('string')
    response = await requestOutResponseIn(entityMetaUrl, undefined, stub, state)
    expect(response.content.timeline.length).toBe(2)
  })
})

describe('TemporalEntity delete and undelete', async () => {
  let state
  let stub  // if stub is left undefined, then fetch is used instead of stub.fetch
  if (process?.env?.VITEST_BASE_URL != null) {
    baseUrl = process.env.VITEST_BASE_URL
  } else {
    const id = env.DO_API.newUniqueId()
    // eslint-disable-next-line no-undef
    state = await getMiniflareDurableObjectState(id)
    stub = new DurableAPI(state, env, id.toString())
  }
  let entityMetaUrl

  it('should allow delete', async () => {
    url = `${baseUrl}/*/*`
    let options = {
      method: 'POST',
      body: { value: { a: 1 }, userID: 'userW' },
    }
    let response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(201)
    expect(response.content.meta.validFrom).to.be.a('string')
    idString = response.content.idString
    lastValidFrom = response.content.meta.validFrom
    entityMetaUrl = `${url}/${idString}/entity-meta/`
    response = await requestOutResponseIn(entityMetaUrl, undefined, stub, state)
    expect(response.content.timeline.length).toBe(1)

    url = `${url}/${idString}`
    options = {
      method: 'PUT',
      body: { value: { a: 2 }, userID: 'userX' },  // Same userID but different value
      headers: { 'If-Unmodified-Since': lastValidFrom },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(200)
    expect(response.content.meta.validFrom).to.be.a('string')
    lastValidFrom = response.content.meta.validFrom
    response = await requestOutResponseIn(entityMetaUrl, undefined, stub, state)
    expect(response.content.timeline.length).toBe(2)

    options = {
      method: 'DELETE',
      body: { userID: 'userY' },  // Same userID but different value
      headers: { 'If-Unmodified-Since': lastValidFrom },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(204)
    response = await requestOutResponseIn(entityMetaUrl, undefined, stub, state)
    expect(response.content.timeline.length).toBe(3)
    lastValidFrom = response.content.timeline.at(-1)

    response = await requestOutResponseIn(url, undefined, stub, state)
    expect(response.status).toBe(404)

    if (process?.env?.VITEST_BASE_URL == null) {
      const storage = await state.storage.list()
      const entityMeta = storage.get(`${idString}/entityMeta`)

      const validFrom1 = entityMeta.timeline[0]
      const validFrom2 = entityMeta.timeline[1]
      const validFrom3 = entityMeta.timeline[2]

      const snapshot1 = storage.get(`${idString}/snapshot/${validFrom1}`)
      const snapshot2 = storage.get(`${idString}/snapshot/${validFrom2}`)
      const snapshot3 = storage.get(`${idString}/snapshot/${validFrom3}`)

      expect(snapshot3.value).to.deep.eq(snapshot2.value)
      expect(snapshot1.meta.validTo).toBe(snapshot2.meta.validFrom)
      expect(snapshot2.meta.validTo).toBe(snapshot3.meta.validFrom)
      expect(snapshot3.meta.validTo).toBe(TemporalEntity.END_OF_TIME)
      expect(snapshot3.value).toEqual(snapshot2.value)
      expect(snapshot3.meta.previousValues).toEqual({})
    }
  })

  it('should allow undelete', async () => {
    url = `${baseUrl}/*/*`
    const options = {
      method: 'PATCH',
      body: { undelete: true, userID: 'userY' },
    }
    let response = await requestOutResponseIn(url, options, stub, state)

    expect(response.status).toBe(200)
    expect(response.content.meta.validFrom).to.be.a('string')

    response = await requestOutResponseIn(entityMetaUrl, undefined, stub, state)
    expect(response.content.timeline.length).toBe(4)
    // lastValidFrom = response.content.timeline.at(-1)

    response = await requestOutResponseIn(url, undefined, stub, state)
    expect(response.status).toBe(200)
    expect(response.content.meta.validFrom).to.be.a('string')
    expect(response.content.value).to.deep.eq({ a: 2 })

    if (process?.env?.VITEST_BASE_URL == null) {
      const storage = await state.storage.list()
      // console.log('storage: %O', storage)

      const entityMeta = storage.get(`${idString}/entityMeta`)

      const validFrom2 = entityMeta.timeline[1]
      const validFrom3 = entityMeta.timeline[2]
      const validFrom4 = entityMeta.timeline[3]

      const snapshot2 = storage.get(`${idString}/snapshot/${validFrom2}`)
      const snapshot3 = storage.get(`${idString}/snapshot/${validFrom3}`)
      const snapshot4 = storage.get(`${idString}/snapshot/${validFrom4}`)

      expect(snapshot3.meta.validTo).toBe(snapshot4.meta.validFrom)
      expect(snapshot4.value).toEqual(snapshot2.value)
      expect(snapshot4.meta.previousValues).toEqual({})
    }
  })
})

describe('TemporalEntity auto-incremented validFrom', async () => {
  let state
  let stub  // if stub is left undefined, then fetch is used instead of stub.fetch
  if (process?.env?.VITEST_BASE_URL != null) {
    baseUrl = process.env.VITEST_BASE_URL
  } else {
    const id = env.DO_API.newUniqueId()
    // eslint-disable-next-line no-undef
    state = await getMiniflareDurableObjectState(id)
    stub = new DurableAPI(state, env, id.toString())
  }

  it('should have validFrom 1ms later than requested', async () => {
    const validFromISOString = '2200-01-01T00:00:00.000Z'
    const lastValidFromDate = new Date(validFromISOString)
    const newValidFromDate = new Date(lastValidFromDate.getTime() + 1)  // 1 millisecond later
    const newValidFromISOString = newValidFromDate.toISOString()

    url = `${baseUrl}/*/*`
    let options = {
      method: 'POST',
      body: {
        value: { a: 1 },
        userID: 'userY',
        validFrom: validFromISOString,
      },
    }
    let response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(201)
    expect(response.content.meta.validFrom).to.be.a('string')

    idString = response.content.idString
    url = `${url}/${idString}`
    options = {
      method: 'PUT',
      body: {
        value: { a: 2 },
        userID: 'userZ',
      },
      headers: { 'If-Unmodified-Since': response.content.meta.validFrom },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(200)
    expect(response.content.meta.validFrom).to.be.a('string')
    expect(response.content.meta.validFrom).toBe(newValidFromISOString)
  })
})

describe('deep object put and patch', async () => {
  let state
  let stub  // if stub is left undefined, then fetch is used instead of stub.fetch
  if (process?.env?.VITEST_BASE_URL != null) {
    baseUrl = process.env.VITEST_BASE_URL
  } else {
    const id = env.DO_API.newUniqueId()
    // eslint-disable-next-line no-undef
    state = await getMiniflareDurableObjectState(id)
    stub = new DurableAPI(state, env, id.toString())
  }

  it('should allow deep patching', async () => {
    url = `${baseUrl}/*/*`
    const o = { a: 2000, o: { a: 1, b: 2, children: [1, 'a', new Date()] } }
    let options = {
      method: 'POST',
      body: { value: o, userID: 'userX' },
    }
    let response = await requestOutResponseIn(url, options, stub, state)
    expect(response.content.value).toEqual(o)

    idString = response.content.idString
    url = `${url}/${idString}`
    options = {
      method: 'PATCH',
      body: {
        delta: { o: { a: 2, c: 3 } },
        userID: 'userY',
        validFrom: '2200-01-01T00:00:00.000Z',
      },
      headers: { 'If-Unmodified-Since': response.content.meta.validFrom },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    const o2 = structuredClone(o)
    o2.o.a = 2
    o2.o.c = 3
    expect(response.content.value).toEqual(o2)
    const inner = Object.create(null)
    inner.a = 1
    inner.c = undefined
    const pv = Object.create(null)
    pv.o = inner
    expect(response.content.meta.previousValues).toEqual(pv)

    options = {
      method: 'PATCH',
      body: {
        delta: { o: { children: { 3: 'pushed' } } },
        userID: 'userX',
        validFrom: '2200-01-02T00:00:00.000Z',
      },
      headers: { 'If-Unmodified-Since': response.content.meta.validFrom },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    const o3 = structuredClone(o2)
    o3.o.children.push('pushed')
    expect(response.content.value).toEqual(o3)
  })
})

describe('304 behavior for get and getEntityMeta', async () => {
  let state
  let stub  // if stub is left undefined, then fetch is used instead of stub.fetch
  if (process?.env?.VITEST_BASE_URL != null) {
    baseUrl = process.env.VITEST_BASE_URL
  } else {
    const id = env.DO_API.newUniqueId()
    // eslint-disable-next-line no-undef
    state = await getMiniflareDurableObjectState(id)
    stub = new DurableAPI(state, env, id.toString())
  }
  let ifModifiedSince1msEarlier

  it('should return 304 and no body with correct If-Modified-Since on GET /', async () => {
    url = `${baseUrl}/*/*`
    let options = {
      method: 'POST',
      body: {
        value: { a: 1 },
        userID: 'userY',
      },
    }
    let response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(201)
    expect(response.content.meta.validFrom).to.be.a('string')

    idString = response.content.idString
    url = `${url}/${idString}`
    lastValidFrom = response.content.meta.validFrom
    options = {
      headers: { 'If-Modified-Since': lastValidFrom },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(304)
    expect(response.content).toBeUndefined()

    ifModifiedSince1msEarlier = new Date(new Date(lastValidFrom).valueOf() - 1).toISOString()
    options = {
      headers: { 'If-Modified-Since': ifModifiedSince1msEarlier },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(200)
    expect(response.content.meta.validFrom).to.be.a('string')
    expect(response.content).not.toBeUndefined()
  })

  it('should return 304 and no body with correct If-Modified-Since on GET /entity-meta', async () => {
    const entityMetaUrl = `${url}/entity-meta/`
    let options = {
      headers: { 'If-Modified-Since': lastValidFrom },
    }
    let response = await requestOutResponseIn(entityMetaUrl, options, stub, state)
    expect(response.status).toBe(304)
    expect(response.content).toBeUndefined()

    options = {
      headers: { 'If-Modified-Since': ifModifiedSince1msEarlier },
    }
    response = await requestOutResponseIn(entityMetaUrl, options, stub, state)
    expect(response.status).toBe(200)
    expect(response.content).not.toBeUndefined()
  })
})

describe('TemporalEntity debouncing', async () => {
  let state
  let stub  // if stub is left undefined, then fetch is used instead of stub.fetch
  if (process?.env?.VITEST_BASE_URL != null) {
    baseUrl = process.env.VITEST_BASE_URL
  } else {
    const id = env.DO_API.newUniqueId()
    // eslint-disable-next-line no-undef
    state = await getMiniflareDurableObjectState(id)
    stub = new DurableAPI(state, env, id.toString())
  }

  it('should not create new snapshots when updated within granularity', async () => {
    url = `${baseUrl}/*/*`
    let options = {
      method: 'POST',
      body: {
        value: { a: 1 },
        userID: 'userY',
      },
    }
    let response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(201)
    expect(response.content.meta.validFrom).to.be.a('string')

    const firstValidFrom = response.content.meta.validFrom

    idString = response.content.idString
    url = `${url}/${idString}`
    options = {
      method: 'PUT',
      body: {
        value: { a: 2 },
        userID: 'userY',
      },
      headers: { 'If-Unmodified-Since': response.content.meta.validFrom },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(200)
    expect(response.content.meta.validFrom).to.be.a('string')

    const entityMetaUrl = `${url}/entity-meta/`
    response = await requestOutResponseIn(entityMetaUrl, undefined, stub, state)
    expect(response.status).toBe(200)
    expect(response.content.timeline.length).toBe(1)

    response = await requestOutResponseIn(url, undefined, stub, state)
    expect(response.status).toBe(200)
    expect(response.content.meta.validFrom).to.be.a('string')
    expect(response.content.value).toEqual({ a: 2 })
    expect(response.content.meta.validFrom, firstValidFrom, 'should get back first validFrom')
    const pv = Object.create(null)
    pv.a = undefined
    expect(response.content.meta.previousValues).toEqual(pv)

    options = {
      method: 'PUT',
      body: {
        value: { a: 3 },
        userID: 'userZ',
      },
      headers: { 'If-Unmodified-Since': firstValidFrom },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(200)
    expect(response.content.meta.validFrom).to.be.a('string')

    options = {
      method: 'PUT',
      body: {
        value: { a: 4 },
        userID: 'userZ',
      },
      headers: { 'If-Unmodified-Since': response.content.meta.validFrom },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(200)
    expect(response.content.meta.validFrom).to.be.a('string')
    expect(response.content.value).toEqual({ a: 4 })
    lastValidFrom = response.content.meta.validFrom

    response = await requestOutResponseIn(entityMetaUrl, undefined, stub, state)
    expect(response.content.timeline.length).toBe(2)

    const newValidFromDate = new Date(new Date(lastValidFrom).getTime() + 61 * 60 * 1000) // 61 minutes later

    options = {
      method: 'PUT',
      body: {
        value: { a: 5 },
        userID: 'userZ',
        validFrom: newValidFromDate,
      },
      headers: { 'If-Unmodified-Since': lastValidFrom },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    expect(response.status).toBe(200)
    expect(response.content.value).toEqual({ a: 5 })
    expect(response.content.meta.validFrom).to.be.a('string')

    response = await requestOutResponseIn(entityMetaUrl, undefined, stub, state)
    expect(response.content.timeline.length).toBe(3)
  })
})

describe('TemporalEntity granularity', async () => {
  let state
  let stub  // if stub is left undefined, then fetch is used instead of stub.fetch
  if (process?.env?.VITEST_BASE_URL != null) {
    baseUrl = process.env.VITEST_BASE_URL
  } else {
    const id = env.DO_API.newUniqueId()
    // eslint-disable-next-line no-undef
    state = await getMiniflareDurableObjectState(id)
    stub = new DurableAPI(state, env, id.toString())
  }

  it('should not debounce when update is outside of granularity', async () => {
    url = `${baseUrl}/***test-granularity***/v1`
    let options = {
      method: 'POST',
      body: {
        value: { a: 1 },
        userID: 'userX',
      },
    }
    let response = await requestOutResponseIn(url, options, stub, state)

    let newValidFromDate = new Date(new Date(response.content.meta.validFrom).getTime() + 1500) // 1500 ms later
    idString = response.content.idString
    url = `${url}/${idString}`
    options = {
      method: 'PUT',
      body: {
        value: { a: 2 },
        userID: 'userX',
        validFrom: newValidFromDate.toISOString(),
      },
      headers: { 'If-Unmodified-Since': response.content.meta.validFrom },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    lastValidFrom = response.content.meta.validFrom

    const entityMetaUrl = `${url}/entity-meta/`
    response = await requestOutResponseIn(entityMetaUrl, undefined, stub, state)
    expect(response.content.timeline.length).toBe(2)

    newValidFromDate = new Date(new Date(lastValidFrom).getTime() + 500) // 500 ms later
    options = {
      method: 'PUT',
      body: {
        value: { a: 2 },
        userID: 'userX',
        validFrom: newValidFromDate.toISOString(),
      },
      headers: { 'If-Unmodified-Since': lastValidFrom },
    }
    response = await requestOutResponseIn(url, options, stub, state)
    lastValidFrom = response.content.meta.validFrom

    response = await requestOutResponseIn(entityMetaUrl, undefined, stub, state)
    expect(response.content.timeline.length).toBe(2)
  })
})
