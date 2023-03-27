// 3rd party imports
import { describe, it, expect } from 'vitest'

// monorepo imports
import { requestOutResponseIn } from '@transformation-dev/cloudflare-do-utils'

// local imports
import { DurableAPI, ExperimenterV2 } from '../src/index.js'

// initialize imports
// const describe = setupMiniflareIsolatedStorage()  // intentionally not using this describe because I don't want isolated storage between my it/test blocks
// eslint-disable-next-line no-undef
const env = getMiniflareBindings()
// env.DEBUG = 'blueprint:*'
env.DEBUG = 'blueprint:temporal-entity'
// env.DEBUG = 'nothing'

let lastValidFrom
let idString
const baseUrl = 'http://fake.host'
let url = `${baseUrl}/experimenter/v2`

describe('Concurrency Experimenter', () => {
  let response

  it.todo('should stay consistent', async () => {
    response = await requestOutResponseIn('/api/do/experimenter/v2?name=Larry')
    expect(`HELLO ${response.content.name.toUpperCase()}!`).to.equal(response.content.greeting)
    const { idString } = response.content

    response = await requestOutResponseIn(`/api/do/experimenter/v2/${idString}?nombre=John`)  // intentional typo
    expect(response.status).to.equal(500)

    response = await requestOutResponseIn(`/api/do/experimenter/v2/${idString}`)
    expect(`HELLO ${response.content.name.toUpperCase()}!`).to.equal(response.content.greeting)
    expect(response.content.name).to.equal('Larry')
  })

  it.todo('should not stay consistent', async () => {
    response = await requestOutResponseIn('/api/do/experimenter/v3?name=Larry')
    expect(`HELLO ${response.content.name.toUpperCase()}!`).to.equal(response.content.greeting)
    const { idString } = response.content

    response = await requestOutResponseIn(`/api/do/experimenter/v3/${idString}?nombre=John`)  // intentional typo
    expect(response.status).to.equal(500)

    response = await requestOutResponseIn(`/api/do/experimenter/v3/${idString}`)
    // eslint-disable-next-line no-unused-expressions
    expect(response.content.name).to.be.null  // ESLint doesn't like this but it works fine. Go figure?
    expect(response.content.greeting).to.equal('HELLO LARRY!')
  })
})
