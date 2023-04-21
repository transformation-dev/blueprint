/* eslint-disable no-undef */

// 3rd party imports
// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest'

// monorepo imports
import { requestOutResponseIn } from '../src/content-processor.js'

// local imports
import worker, { DurableAPI } from './test-harness/index.js'
// import { getFetchPartial } from '../src/people-lookup.js'

// const describe = setupMiniflareIsolatedStorage()  // intentionally not using this describe because I don't want isolated storage between my it/test blocks
const env = getMiniflareBindings()
const context = new ExecutionContext()

// env.DEBUG = 'blueprint:*'
env.DEBUG = 'blueprint:people-lookup'
// env.DEBUG = 'nothing'

const isLive = process?.env?.VITEST_BASE_URL != null

async function getCleanState() {
  let baseUrl
  let stub
  if (isLive) {
    baseUrl = process.env.VITEST_BASE_URL
  } else {
    stub = { fetch: worker.getFetchPartial(env, context) }
    // stub = worker
    baseUrl = 'http://fake.host'
  }
  const url = `${baseUrl}/`  // This is a default that will often work but can be overwritten per test
  return ({ stub, baseUrl, url })
}

describe('A series of People operations', async () => {
  // eslint-disable-next-line prefer-const
  let { stub, baseUrl, url } = await getCleanState()

  it('should allow something', async () => {
    const personValue = { name: 'Larry Salvatore', emailAddresses: ['larry@transformation.dev', 'sal@mafia.com'], other: 'stuff' }
    const rootNodeValue = { label: 'Transformation.dev', emailExtensions: ['transformation.dev'] }
    const options = {
      method: 'PATCH',
      body: { personValue, rootNodeValue, userID: 'userW' },
    }
    const response = await requestOutResponseIn(url, options, stub)
    console.log('response.content: %O', response.content)

    // expects/asserts to always run
    expect(response.status).toBe(201)

    // storage operation expects/asserts to only run in miniflare (aka not live over http)
    if (!isLive) {
      // asserts/expects go here
    }
  })
})
