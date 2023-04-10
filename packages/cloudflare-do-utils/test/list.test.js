/* eslint-disable no-undef */

// 3rd party imports
// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest'

// monorepo imports
import { requestOutResponseIn } from '../src/content-processor.js'

// local imports
import { DurableAPI } from './test-harness/index.js'

// const describe = setupMiniflareIsolatedStorage()  // intentionally not using this describe because I don't want isolated storage between my it/test blocks
const env = getMiniflareBindings()
// env.DEBUG = 'blueprint:*'
env.DEBUG = 'blueprint:list'
// env.DEBUG = 'nothing'

const isLive = process?.env?.VITEST_BASE_URL != null

async function getCleanState() {
  let baseUrl
  let state
  let stub
  if (isLive) {
    baseUrl = process.env.VITEST_BASE_URL
  } else {
    const id = env.DO_API.newUniqueId()
    // eslint-disable-next-line no-undef
    state = await getMiniflareDurableObjectState(id)
    // stub = await env.DO_API.get(id)  // this is how Cloudflare suggests getting the stub. However, doing it the way below allows vitest --coverage to work
    stub = new DurableAPI(state, env, id.toString())
    baseUrl = 'http://fake.host'
  }
  const url = `${baseUrl}/list-for-testing/v1`  // This is a default that will often work but can be overwritten per test
  return ({ state, stub, baseUrl, url })
}

describe('A series of List operations', async () => {
  // eslint-disable-next-line prefer-const, no-unused-vars, no-shadow
  let { state, stub, baseUrl, url } = await getCleanState()

  it('should allow List creation with POST', async () => {
    const value = { name: 'Larry Salvatore', emailAddresses: ['larry@nowhere.com', 'sal@mafia.com'], other: 'stuff' }
    const options = {
      method: 'POST',
      body: { value, userID: 'userW' },
    }
    const response = await requestOutResponseIn(url, options, stub, state)

    // expects/asserts to always run
    expect(response.status).toBe(201)
    const { elements, idString, meta } = response.content
    expect(elements).to.be.an('array')
    expect(elements.length).to.eq(1)
    const elementStub = elements[0]
    expect(elementStub).toMatchObject({ name: value.name, emailAddresses: value.emailAddresses })
    expect(meta.type).to.eq('list-for-testing')
    expect(meta.version).to.eq('v1')
    expect(response.headers.get('Content-ID')).to.eq(idString)
    expect(idString).to.be.a('string')
    url += `/${idString}`

    // storage operation expects/asserts to only run in miniflare (aka not live over http)
    if (!isLive) {
      const storage = await state.storage.list()
      const elementsFromStorage = storage.get(`${idString}/elements`)
      expect(elementsFromStorage.length).toBe(1)
      expect(elementsFromStorage[0]).to.deep.eq(elementStub)
    }
  })

  it('should allow adding another element with POST', async () => {
    const value = { name: 'Jennifer Lynn', emailAddresses: ['jennifer@nowhere.com'], other: 'stuff' }
    const options = {
      method: 'POST',
      body: { value, userID: 'userW' },
    }
    const response = await requestOutResponseIn(url, options, stub, state)

    // expects/asserts to always run
    expect(response.status).toBe(200)
    const { elements, idString, meta } = response.content
    expect(elements).to.be.an('array')
    expect(elements.length).to.eq(2)
    const elementStub = elements[1]
    expect(elementStub).toMatchObject({ name: value.name, emailAddresses: value.emailAddresses })
    expect(meta.type).to.eq('list-for-testing')
    expect(meta.version).to.eq('v1')
    expect(response.headers.get('Content-ID')).to.eq(idString)
    expect(idString).to.be.a('string')
    url += `/${idString}`

    // storage operation expects/asserts to only run in miniflare (aka not live over http)
    if (!isLive) {
      const storage = await state.storage.list()
      const elementsFromStorage = storage.get(`${idString}/elements`)
      expect(elementsFromStorage.length).toBe(2)
      expect(elementsFromStorage[1]).to.deep.eq(elementStub)
    }
  })

  it.todo('should return the List with GET', async () => {
    const response = await requestOutResponseIn(`${url}?asOf=${new Date().toISOString()}`, undefined, stub)
    expect(response.status).toBe(200)
    expect(response.content.current.tree).toMatchObject(tree)
    // this next line confirms that node2 is only transmitted once eventhough it shows up twice in the tree
    expect(response.content.current.tree.children[0].children[0]).toBe(response.content.current.tree.children[1])
  })
})
