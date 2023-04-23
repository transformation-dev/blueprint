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
    baseUrl = 'http://fake.host'
  }
  const url = `${baseUrl}/`  // This is a default that will often work but can be overwritten per test
  return ({ stub, baseUrl, url })
}

describe('A series of mostly happy-path people lookup operations', async () => {
  // eslint-disable-next-line prefer-const
  let { stub, baseUrl, url } = await getCleanState()

  // TODO: Test non-happy path of invalid personValue once person-for-testing has a schema

  it('should allow creating both at once', async () => {
    const personValue = { name: 'Larry Salvatore', emailAddresses: ['larry@transformation.dev', 'Sal@Mafia.com'], other: 'stuff' }
    const rootNodeValue = { label: 'Transformation.dev', emailExtensions: ['transformation.dev'] }
    const options = {
      method: 'PATCH',
      body: { personValue, rootNodeValue },
    }
    const response = await requestOutResponseIn(url, options, stub)

    expect(response.status).toBe(200)
    const { person, orgTree } = response.content
    personValue.emailAddresses = personValue.emailAddresses.map((value) => value.toLowerCase())
    expect(person.value).toMatchObject(personValue)
    expect(person.idString).toBe(person.meta.userID)
    expect(orgTree.tree.label).toBe(rootNodeValue.label)
    expect(person.idString).toBe(orgTree.meta.userID)

    // TODO: Use env.PEOPLE_LOOKUP to confirm that the keys were added
    console.log('env.PEOPLE_LOOKUP: %O', await env.PEOPLE_LOOKUP.list())

    // TODO: Expect the first person for an orgTree to be Admin on the rootNode
  })

  it.todo('should allow adding a new Person to an existing Tree', async () => {
    const personValue = { name: 'Larry Salvatore', emailAddresses: ['larry@transformation.dev', 'sal@mafia.com'], other: 'stuff' }
    const rootNodeValue = { label: 'Transformation.dev', emailExtensions: ['transformation.dev'] }
    const options = {
      method: 'PATCH',
      body: { personValue, rootNodeValue },
    }
    const response = await requestOutResponseIn(url, options, stub)
    console.log('response.content: %O', response.content)

    expect(response.status).toBe(200)
    const { person, orgTree } = response.content
    expect(person.value).toMatchObject(personValue)
    expect(person.idString).toBe(person.meta.userID)
    expect(orgTree.tree.label).toBe(rootNodeValue.label)
    expect(person.idString).toBe(orgTree.meta.userID)
  })
})

/*
Test cases:
  - existing Person, new OrgTree
  - new Person, existing OrgTree
  - existing Person, existing OrgTree
  - invalid personValue on initial creation
  - invalid rootNodeValue on initial creation. I think we should try/catch and return the person value
*/
