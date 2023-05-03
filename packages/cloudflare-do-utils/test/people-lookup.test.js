/* eslint-disable no-undef */

// 3rd party imports
// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest'

// monorepo imports
import { requestOutResponseIn } from '../src/content-processor.js'
import { listAllKVKeys } from '../src/kv-utils.js'

// local imports
import worker from './test-harness/index.js'

// const describe = setupMiniflareIsolatedStorage()  // intentionally not using this describe because I don't want isolated storage between my it/test blocks
const env = getMiniflareBindings()
const context = new ExecutionContext()

// env.DEBUG = 'blueprint:*'
// env.DEBUG = 'blueprint:people-lookup'
env.DEBUG = 'nothing'

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
  // eslint-disable-next-line prefer-const, no-unused-vars
  let { stub, baseUrl, url } = await getCleanState()

  let personValue
  let larryIDString
  let jenniferIDString
  let transformationDevIDString
  let theMafiaIDString

  // TODO: Test non-happy path of invalid personValue once person-for-testing has a schema

  it('should allow PATCH with new Person, Larry, to new Tree, Transformation.dev', async () => {
    personValue = { name: 'Larry Salvatore', emailAddresses: ['larry@transformation.dev', 'Sal@Mafia.com'], other: 'stuff' }
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

    const kvKeys = await listAllKVKeys(env.PEOPLE_LOOKUP)

    // 1. key: `emailAddress/${emailAddress}`, metadata: { personIDString }
    personValue.emailAddresses.forEach((emailAddress) => {
      expect(kvKeys[`emailAddress/${emailAddress}`].personIDString).toBe(person.idString)
    })

    // 2. key: `orgTree/${orgTreeIDString}`, metadata: { label }
    expect(kvKeys[`orgTree/${orgTree.idString}`].label).toBe(orgTree.tree.label)

    // 3. key: `orgTree/${orgTreeIDString}/${personIDString}`, metadata: { name }
    expect(kvKeys[`orgTree/${orgTree.idString}/${person.idString}`].name).toBe(person.value.name)

    // 4. key: `person/${personIDString}/${orgTreeIDString}`, metadata: { label }
    expect(kvKeys[`person/${person.idString}/${orgTree.idString}`].label).toBe(orgTree.tree.label)

    // 5. key: `person/${personIDString}`, metadata: { name }
    expect(kvKeys[`person/${person.idString}`].name).toBe(person.value.name)

    // TODO: Expect the first person for an orgTree to be Admin on the rootNode

    larryIDString = person.idString  // Used in next test
    transformationDevIDString = orgTree.idString  // Used in later test
  })

  it('should allow PATCH with existing Person, Larry, and new Tree, The Mafia', async () => {
    const rootNodeValue = { label: 'The Mafia' }
    const options = {
      method: 'PATCH',
      body: { personIDString: larryIDString, rootNodeValue },
    }
    const response = await requestOutResponseIn(url, options, stub)

    expect(response.status).toBe(200)
    const { person, orgTree } = response.content
    expect(person.value).toMatchObject(personValue)
    expect(person.idString).toBe(person.meta.userID)
    expect(orgTree.tree.label).toBe(rootNodeValue.label)
    expect(person.idString).toBe(orgTree.meta.userID)

    const kvKeys = await listAllKVKeys(env.PEOPLE_LOOKUP)

    // 2. key: `orgTree/${orgTreeIDString}`, metadata: { label }
    expect(kvKeys[`orgTree/${orgTree.idString}`].label).toBe(orgTree.tree.label)

    // 3. key: `orgTree/${orgTreeIDString}/${personIDString}`, metadata: { name }
    expect(kvKeys[`orgTree/${orgTree.idString}/${person.idString}`].name).toBe(person.value.name)

    // 4. key: `person/${personIDString}/${orgTreeIDString}`, metadata: { label }
    expect(kvKeys[`person/${person.idString}/${orgTree.idString}`].label).toBe(orgTree.tree.label)

    // TODO: Expect the first person for an orgTree to be Admin on the rootNode

    theMafiaIDString = orgTree.idString  // Used in later test
  })

  it('should allow PATCH with new Person, Jennifer, and existing Tree, Transformation.dev', async () => {
    personValue = { name: 'Jennifer Lynn', emailAddresses: ['jennifer@transformation.dev'], other: 'beautiful' }
    const options = {
      method: 'PATCH',
      body: { personValue, orgTreeIDString: transformationDevIDString },
    }
    const response = await requestOutResponseIn(url, options, stub)

    expect(response.status).toBe(200)
    const { person, orgTree } = response.content
    personValue.emailAddresses = personValue.emailAddresses.map((value) => value.toLowerCase())
    expect(person.value).toMatchObject(personValue)
    expect(person.idString).toBe(person.meta.userID)

    const kvKeys = await listAllKVKeys(env.PEOPLE_LOOKUP)

    // 1. key: `emailAddress/${emailAddress}`, metadata: { personIDString }
    personValue.emailAddresses.forEach((emailAddress) => {
      expect(kvKeys[`emailAddress/${emailAddress}`].personIDString).toBe(person.idString)
    })

    // 2. key: `orgTree/${orgTreeIDString}`, metadata: { label }
    expect(kvKeys[`orgTree/${orgTree.idString}`].label).toBe(orgTree.tree.label)

    // 3. key: `orgTree/${orgTreeIDString}/${personIDString}`, metadata: { name }
    expect(kvKeys[`orgTree/${orgTree.idString}/${person.idString}`].name).toBe(person.value.name)

    // 4. key: `person/${personIDString}/${orgTreeIDString}`, metadata: { label }
    expect(kvKeys[`person/${person.idString}/${orgTree.idString}`].label).toBe(orgTree.tree.label)

    // 5. key: `person/${personIDString}`, metadata: { name }
    expect(kvKeys[`person/${person.idString}`].name).toBe(person.value.name)

    jenniferIDString = person.idString  // Used in next test
  })

  it('should allow PATCH with existing Person, Jennifer, and existing Tree, The Mafia', async () => {
    const options = {
      method: 'PATCH',
      body: { personIDString: jenniferIDString, orgTreeIDString: theMafiaIDString },
    }
    const response = await requestOutResponseIn(url, options, stub)

    expect(response.status).toBe(200)
    const { person, orgTree } = response.content
    personValue.emailAddresses = personValue.emailAddresses.map((value) => value.toLowerCase())
    expect(person.value).toMatchObject(personValue)
    expect(person.idString).toBe(person.meta.userID)

    const kvKeys = await listAllKVKeys(env.PEOPLE_LOOKUP)

    // 1. key: `emailAddress/${emailAddress}`, metadata: { personIDString }
    personValue.emailAddresses.forEach((emailAddress) => {
      expect(kvKeys[`emailAddress/${emailAddress}`].personIDString).toBe(person.idString)
    })

    // 2. key: `orgTree/${orgTreeIDString}`, metadata: { label }
    expect(kvKeys[`orgTree/${orgTree.idString}`].label).toBe(orgTree.tree.label)

    // 3. key: `orgTree/${orgTreeIDString}/${personIDString}`, metadata: { name }
    expect(kvKeys[`orgTree/${orgTree.idString}/${person.idString}`].name).toBe(person.value.name)

    // 4. key: `person/${personIDString}/${orgTreeIDString}`, metadata: { label }
    expect(kvKeys[`person/${person.idString}/${orgTree.idString}`].label).toBe(orgTree.tree.label)

    // 5. key: `person/${personIDString}`, metadata: { name }
    expect(kvKeys[`person/${person.idString}`].name).toBe(person.value.name)
  })

  it('should throw on PATCH with new Person, using exising email address', async () => {
    personValue = { name: 'Jennifer Impostor', emailAddresses: ['jennifer@transformation.dev'], other: 'evil' }
    const options = {
      method: 'PATCH',
      body: { personValue, orgTreeIDString: transformationDevIDString },
    }
    const response = await requestOutResponseIn(url, options, stub)

    expect(response.status).toBe(409)
    expect(response.content.error.message).toMatch('Email address(es) already in use')
  })

/*
Test cases:
  - invalid personValue on initial creation
  - invalid rootNodeValue on initial creation. I think we should try/catch and return the person value
*/
})
