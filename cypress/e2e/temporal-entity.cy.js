/// <reference types="Cypress" />

import { Encoder } from 'cbor-x'
const cborSC = new Encoder({ structuredClone: true })

context('Temporal Entity', () => {
  
  it('should respond with 415 on PUT without Content-Type header', () => {
    const options = {
      method: 'PUT',
      url: '/api/temporal-entity',
      body: { a: 1 },
      failOnStatusCode: false,
    }
    cy.request(options).as('request')
    cy.get('@request').then(response => {
      expect(response.status).to.eq(415)
    })
  })

  it('should respond with 406 on PUT without Accept header "application/cbor-sc"', () => {
    const options = {
      method: 'PUT',
      url: '/api/temporal-entity',
      body: { a: 1 },
      failOnStatusCode: false,
      headers: {
        'Content-Type': 'application/cbor-sc',
        'Accept': 'application/json',
      }
    }
    cy.request(options).as('request')
    cy.get('@request').then(response => {
      expect(response.status).to.eq(406)
    })
  })

  it('should respond with 400 because the content was not encoded in cbor-sc', () => {
    const options = {
      method: 'PUT',
      url: '/api/temporal-entity',
      body: { a: 1 },
      failOnStatusCode: false,
      headers: {
        'Content-Type': 'application/cbor-sc',
        'Accept': 'application/cbor-sc',
      }
    }
    cy.request(options).as('request')
    cy.get('@request').then(response => {
      expect(response.status).to.eq(400)
    })
  })

  let id
  let t1
  let t2

  // Using fetch() instead of cy.request() because cy.request() I couldn't get cy.request() to work for binary data
  it('should allow PUT', () => {
    const o = { value: { a: 1, b: 2 }, userID: '1' }
    const u8a = cborSC.encode(o)
    const options = {
      method: 'PUT',
      body: u8a,
      headers: {
        'Content-Type': 'application/cbor-sc',
        'Accept': 'application/cbor-sc',
      },
    }

    cy.wrap(null).then(async () => {
      const response = await fetch('/api/temporal-entity', options)
      expect(response.status).to.eq(200)

      const ab = await response.arrayBuffer()
      const u8a = new Uint8Array(ab)
      const o = cborSC.decode(u8a)

      // const dString = new Date().toISOString()
      // expect(o.meta.validFrom <= dString).to.be.true  // Flakey because it relies on time synchronization between the server and the client
      
      expect(o.meta.id).to.be.a('string')

      id = o.meta.id
      t1 = o.meta.validFrom
      delete o.meta.id
      delete o.meta.validFrom
      expect(o).to.deep.eq({
        "meta": {
          "previousValues": { a: undefined, b: undefined },
          "userID": "1",
          "validTo": "9999-01-01T00:00:00.000Z"
        },
        "value": { "a": 1, "b": 2, }
      })
    })
  })

  it('should allow PATCH', () => {
    const o = { delta: { a: 10, b: undefined }, userID: '1' }
    const u8a = cborSC.encode(o)
    const options = {
      method: 'PATCH',
      body: u8a,
      headers: {
        'Content-Type': 'application/cbor-sc',
        'Accept': 'application/cbor-sc',
      },
    }

    cy.wrap(null).then(async () => {
      const response = await fetch(`/api/temporal-entity/${id}`, options)
      expect(response.status).to.eq(200)

      const ab = await response.arrayBuffer()
      const u8a = new Uint8Array(ab)
      const o = cborSC.decode(u8a)

      // expect(o.meta.validFrom <= new Date().toISOString()).to.be.true  // Flakey because it relies on time synchronization between the server and the client
      expect(o.meta.id).to.be.a('string')

      t2 = o.meta.validFrom
      delete o.meta.validFrom
      expect(o).to.deep.eq({
        "meta": {
          "previousValues": { a: 1, b: 2 },
          "userID": "1",
          "validTo": "9999-01-01T00:00:00.000Z",
          "id": id,
        },
        "value": { "a": 10 }
      })
    })
  })

  it('should return entityMeta', () => {
    const o = { delta: { a: 10, b: undefined }, userID: '1' }
    const u8a = cborSC.encode(o)
    const options = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/cbor-sc',
        'Accept': 'application/cbor-sc',
      },
    }

    cy.wrap(null).then(async () => {
      const response = await fetch(`/api/temporal-entity/${id}/entity-meta`, options)
      expect(response.status).to.eq(200)

      const ab = await response.arrayBuffer()
      const u8a = new Uint8Array(ab)
      const o = cborSC.decode(u8a)

      expect(o.timeline).to.deep.eq([t1, t2])
    })
  })

})
