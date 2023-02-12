/// <reference types="Cypress" />

import { Encoder, encode, decode } from 'cbor-x'
const cborSC = new Encoder({ structuredClone: true })

async function encodeAndFetch(url, options) {  // TODO: move this to a helper file
  if (!options) options = {}

  if (options.body) {
    const u8a = cborSC.encode(options.body)
    // const u8a = encode(options.body)  // using this seems to fail regardless of how I decode
    options.body = u8a
  }

  let headers
  if (options.headers) {
    headers = new Headers(options.headers)
  } else {
    headers = new Headers()
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/cbor-sc')
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/cbor-sc')
  }
  options.headers = headers

  return await fetch(url, options)
}

async function encodeFetchAndDecode(url, options) {  // TODO: move this to a helper file
  const response = await encodeAndFetch(url, options)
  if (response.status >= 500) {
    response.asText = await response.text()
  } else {
    const ab = await response.arrayBuffer()
    if (ab) {
      const u8a = new Uint8Array(ab)
      response.obj = cborSC.decode(u8a)
      // const o = decode(u8a)  // on the other hand, this works regardless of how I encode
      response.asText = JSON.stringify(response.obj, null, 2)
    }
  }
  return response
}

context('Concurrency Experimenter', () => {
  let idString
  let response
  let successfulPostCount = 0
  let successfulGetCount = 0

  async function post() {
    if (idString == null) {
      response = await encodeFetchAndDecode('/api/do/experimenter/v1', { method: 'POST' })
    } else {
      response = await encodeFetchAndDecode(`/api/do/experimenter/v1/${idString}`, { method: 'POST' })
    }
    if (response.status >= 500) {
    } else {
      successfulPostCount++
      if (idString == null) idString = response.obj.idString
    }
  }

  async function getAndCheck() {
    // if (idString != null) {
      response = await encodeFetchAndDecode(`/api/do/experimenter/v1/${idString}`)
      if (response.status >= 400) {
        console.log('GET failed')
      } else {
        successfulGetCount++
        const obj = response.obj
        expect(obj.value).to.equal(obj.valueInMemory)
        expect(obj.twiceValue).to.equal(obj.twiceValueInMemory)
        expect(obj.value * 2).to.equal(obj.twiceValue)
      }
    // }
  }

  it('should stay consistent in spite of failing 50% of the time', () => {
    cy.wrap(null).then(async () => {
      let retries = 10
      while (idString == null && retries > 0) {
        await post()
        retries--
      }
      const promises = []
      for (let i = 0; i < 2; i++) {
        if (Math.random() < 0.9) {
          promises.push(post())
        } else {
          promises.push(getAndCheck())
        }
      }
      cy.wrap(null).then(async () => {
        await Promise.all(promises)
        console.log(`successfulPostCount: ${successfulPostCount}`)
        console.log(`successfulGetCount: ${successfulGetCount}`)
      })
    })
  })
})
