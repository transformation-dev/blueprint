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
  const ab = await response.arrayBuffer()
  if (ab) {
    const u8a = new Uint8Array(ab)
    const o = cborSC.decode(u8a)
    // const o = decode(u8a)  // on the other hand, this works regardless of how I encode
    response.CBOR_SC = o
  }
  return response
}

context('Concurrency Experimenter', () => {

  it('should POST', () => {
    cy.wrap(null).then(async () => {
      let response = await encodeFetchAndDecode('/api/experimenter', { method: 'POST'})
      console.log('response.CBOR_SC', response.CBOR_SC)
      const id = response.CBOR_SC.id
      expect(response.status).to.eq(200)

      cy.wrap(null).then(async () => {
        let response = await encodeFetchAndDecode(`/api/experimenter/${id}`)
        console.log('response.CBOR_SC', response.CBOR_SC)
        expect(response.status).to.eq(200)
        expect(response.CBOR_SC.value1).to.eq(response.CBOR_SC.value2)

        cy.wrap(null).then(async () => {
          let response = await encodeAndFetch(`/api/experimenter/${id}/throw`, { method: 'POST' })
          console.log(response)
          expect(response.status).to.eq(500)

          cy.wrap(null).then(async () => {
            let response = await encodeFetchAndDecode(`/api/experimenter/${id}`)
            console.log('response.CBOR_SC', response.CBOR_SC)
            expect(response.status).to.eq(200)
            expect(response.CBOR_SC.value1).to.eq(response.CBOR_SC.value2)
          })
        })
      })
    })
  })
})
