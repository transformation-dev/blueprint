/* eslint-disable no-undef */

// 3rd party imports
// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest'

// monorepo imports
import { requestOutResponseIn } from '@transformation-dev/cloudflare-do-utils'

// local imports
import { DurableAPI } from '../src/index.js'

// const describe = setupMiniflareIsolatedStorage()  // intentionally not using this describe because I don't want isolated storage between my it/test blocks
const env = getMiniflareBindings()
env.DEBUG = ''
env.DEBUG = 'blueprint:*'
// env.DEBUG = 'blueprint:tree'

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
    stub = new DurableAPI(state, env)
    baseUrl = 'https://fake.host'
  }
  const url = `${baseUrl}/org-tree/v1`  // This is a default that will often work but can be overwritten per test
  return ({ state, stub, baseUrl, url })
}

describe('Org Tree', async () => {
  // eslint-disable-next-line prefer-const, no-unused-vars, no-shadow
  let { state, stub, baseUrl, url } = await getCleanState()

  it('should respond with 200', async () => {
    const response = await requestOutResponseIn(url, undefined, stub, state)  // All this does is confirm that the DO_API compiles and can respond to a GET. The tests in cloudflare-do-utils are thorough.
    expect(response.status).toBe(200)
  })
})
