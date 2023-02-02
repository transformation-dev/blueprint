/// <reference types="Cypress" />

import { Encoder, encode, decode } from 'cbor-x'
const cborSC = new Encoder({ structuredClone: true })

async function encodeAndFetch(url, options) {  // TODO: move this to a helper file
  if (options.body) {
    const u8a = cborSC.encode(options.body)
    // const u8a = encode(options.body)  // using this seems to fail regardless of how I decode
    options.body = u8a
  }

  const headers = new Headers(options.headers)
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

context('Tree', () => {

  // TODO: Test to confirm that for DAGs the nodes that are referenced twice are actually the same object; === rather than just deep.eq

  it('should allow POST, PATCH addNode', () => {
    const rootNode = {
      value: { a: 1 },
      type: '***test-has-children***',
      version: 'v1',
    }
    let options = {
      method: 'POST',
      body: { rootNode, userID: 'UserW' },
    }

    cy.wrap(null).then(async () => {
      let response = await encodeFetchAndDecode('/api/tree/v1', options)
      expect(response.status).to.eq(201)
      expect(response.headers.get('Content-Type')).to.eq('application/cbor-sc')

      const o = response.CBOR_SC
      const { meta, tree } = o[0]
      console.log('o', o)
      expect(meta.nodeCount).to.be.a('number')
      expect(meta.nodeCount).to.eq(1)
      expect(meta.validFrom).to.be.a('string')
      expect(meta.userID).to.eq('UserW')
      expect(response.headers.get('ETag')).to.eq(meta.eTag)

      // TODO: Return and finish this test of adding a new child node once I have a way of retrieving the node
      
      // const options2 = {
      //   method: 'PATCH',
      //   body: {
      //     delta: { a: 10, b: undefined },
      //     userID: '2',
      //     validFrom: newValidFromISOString,
      //     impersonatorID: 'impersonator1',
      //   },
      //   headers: {
      //     'If-Match': eTag1,
      //   },
      // }

      // cy.wrap(null).then(async () => {
      //   const response = await encodeFetchAndDecode(`/api/temporal-entity/*/*/${idString}`, options2)
      //   expect(response.status).to.eq(200)

      //   const o = response.CBOR_SC
      //   expect(o.idString).to.eq(idString)
      // })
    })
  })


})
