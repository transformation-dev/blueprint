// 3rd party imports
import { describe, it, expect } from 'vitest'

// monorepo imports
import { requestOutResponseIn } from '../src/content-processor.js'

// local imports
import { DurableAPI } from './test-harness/index.js'

// initialize imports
// const describe = setupMiniflareIsolatedStorage()  // intentionally not using this describe because I don't want isolated storage between my it/test blocks
// eslint-disable-next-line no-undef
const env = getMiniflareBindings()
// env.DEBUG = 'blueprint:*'
// env.DEBUG = 'blueprint:transactional-tester'
env.DEBUG = ''

let response

describe('Transactional Tester', async () => {
  const baseUrl = 'http://fake.host'
  let state
  let stub
  let idString

  it('should stay consistent', async () => {
    // eslint-disable-next-line no-undef
    state = await getMiniflareDurableObjectState('with-transaction')
    stub = new DurableAPI(state, env)

    let url = `${baseUrl}/transactional-tester/with-transaction`

    response = await requestOutResponseIn(`${url}?name=Larry`, undefined, stub, state)
    expect(`HELLO ${response.content.name.toUpperCase()}!`).to.equal(response.content.greeting)

    idString = response.content.idString
    url = `${url}/${idString}`

    response = await requestOutResponseIn(`${url}?nombre=John`, undefined, stub, state)  // intentional typo
    expect(response.status).toBe(500)

    response = await requestOutResponseIn(url, undefined, stub, state)
    expect(`HELLO ${response.content.name.toUpperCase()}!`).to.equal(response.content.greeting)
    expect(response.content.name).to.equal('Larry')
  })

  it('should not stay consistent', async () => {
    // eslint-disable-next-line no-undef
    state = await getMiniflareDurableObjectState('without-transaction')
    stub = new DurableAPI(state, env)

    let url = `${baseUrl}/transactional-tester/without-transaction`  // difference between with-transaction and without-transaction is that without-transaction is not wrapped

    response = await requestOutResponseIn(`${url}?name=Larry`, undefined, stub, state)
    expect(`HELLO ${response.content.name.toUpperCase()}!`).to.equal(response.content.greeting)
    idString = response.content.idString

    url = `${url}/${idString}`

    response = await requestOutResponseIn(`${url}?nombre=John`, undefined, stub, state)  // intentional typo
    expect(response.status).toBe(500)

    response = await requestOutResponseIn(`${url}`, undefined, stub, state)
    // eslint-disable-next-line no-unused-expressions
    expect(response.content.name).to.be.null  // ESLint doesn't like this but it works fine. Go figure?
    expect(response.content.greeting).to.equal('HELLO LARRY!')
  })
})
