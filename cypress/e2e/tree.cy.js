/* eslint-disable no-shadow */
/* eslint-disable no-undef */
/* eslint-disable no-param-reassign */
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

  return fetch(url, options)
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

context('Tree', () => {
  // TODO: Test to confirm that for DAGs the nodes that are referenced twice are actually the same object; === rather than just deep.eq
  // TODO: Tests for every TemporalEntity method
  // TODO: Tests for Tree errors and unhappy paths

  it('should allow POST, PATCH addNode', () => {
    const rootNode = {
      value: { a: 1 },
      type: '***test-has-children***',
      version: 'v1',
    }
    let options = {
      method: 'POST',
      body: { rootNode, userID: 'userW' },
    }

    cy.wrap(null).then(async () => {
      let response = await encodeFetchAndDecode('/api/do/tree/v1', options)
      expect(response.status).to.eq(201)
      expect(response.headers.get('Content-Type')).to.eq('application/cbor-sc')

      const { meta, tree, idString } = response.CBOR_SC
      expect(meta.nodeCount).to.be.a('number')
      expect(meta.nodeCount).to.eq(1)
      expect(meta.validFrom).to.be.a('string')
      expect(meta.userID).to.eq('userW')
      expect(response.headers.get('ETag')).to.eq(meta.eTag)

      cy.wrap(null).then(async () => {
        const response = await encodeFetchAndDecode(`/api/do/tree/v1/${idString}/node/***test-has-children***/v1/0`, { method: 'OPTIONS' })  // TODO: move this to a different test
        expect(response.status).to.eq(405)

        cy.wrap(null).then(async () => {
          const response = await encodeFetchAndDecode(`/api/do/tree/v1/${idString}/node/***test-has-children***/v1/0`, undefined)
          expect(response.status).to.eq(200)
          expect(response.CBOR_SC.idString).to.eq('0')

          const newNode = {
            value: { b: 2 },
            type: '***test-has-children-and-parents***',
            version: 'v1',
          }
          let options = {
            method: 'PATCH',
            body: { addNode: { newNode, parent: '0' }, userID: 'userX' },
          }
          cy.wrap(null).then(async () => {
            const response = await encodeFetchAndDecode(`/api/do/tree/v1/${idString}`, options)
            expect(response.status).to.eq(201)
            expect(response.CBOR_SC.meta.nodeCount).to.eq(2)

            cy.wrap(null).then(async () => {
              const response = await encodeFetchAndDecode(`/api/do/tree/v1/${idString}/node/***test-has-children***/v1/0`, undefined)
              expect(response.status).to.eq(200)

              expect(response.CBOR_SC.meta.children.includes('1')).to.be.true

              cy.wrap(null).then(async () => {
                const response = await encodeFetchAndDecode(`/api/do/tree/v1/${idString}/node/***test-has-children-and-parents***/v1/1`, undefined)
                expect(response.status).to.eq(200)
                expect(response.CBOR_SC.meta.parents.includes('0')).to.be.true
              })
            })
          })
        })
      })
    })
  })
})
