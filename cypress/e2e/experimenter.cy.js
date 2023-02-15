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
  let response

  it('should stay consistent', () => {
    cy.wrap(null).then(async () => {
      response = await encodeFetchAndDecode(`/api/do/experimenter/v2?name=Larry`)
      expect(`HELLO ${response.obj.name.toUpperCase()}!`).to.equal(response.obj.greeting)
      const idString = response.obj.idString

      cy.wrap(null).then(async () => {
        response = await encodeFetchAndDecode(`/api/do/experimenter/v2/${idString}?nombre=John`)  // intentional typo
        expect(response.status).to.equal(500)

        cy.wrap(null).then(async () => {
          response = await encodeFetchAndDecode(`/api/do/experimenter/v2/${idString}`)
          expect(`HELLO ${response.obj.name.toUpperCase()}!`).to.equal(response.obj.greeting)
          expect(response.obj.name).to.equal('Larry')
        })
      })
    })
  })

  it('should not stay consistent', () => {
    cy.wrap(null).then(async () => {
      response = await encodeFetchAndDecode(`/api/do/experimenter/v3?name=Larry`)
      expect(`HELLO ${response.obj.name.toUpperCase()}!`).to.equal(response.obj.greeting)
      const idString = response.obj.idString

      cy.wrap(null).then(async () => {
        response = await encodeFetchAndDecode(`/api/do/experimenter/v3/${idString}?nombre=John`)  // intentional typo
        expect(response.status).to.equal(500)

        cy.wrap(null).then(async () => {
          response = await encodeFetchAndDecode(`/api/do/experimenter/v3/${idString}`)
          console.log(response.obj)
          expect(response.obj.greeting).to.equal('HELLO LARRY!')
          expect(response.obj.name == null).to.be.true
        })
      })
    })
  })
})
