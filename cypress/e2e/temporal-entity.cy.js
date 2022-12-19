/// <reference types="Cypress" />

import { Encoder } from 'cbor-x'
const cborSC = new Encoder({ structuredClone: true })

context('Temporal Entity', () => {
  
  it('should respond with 415', () => {
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

  it('should respond with 406', () => {
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

  it('should respond with error because the content was not encoded in cbor-sc', () => {
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

  it('should allow PUT', () => {
    const o = { value: { a: 1 }, userID: '1' }
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
      const ab = await response.arrayBuffer()
      const u8a = new Uint8Array(ab)
      const o = cborSC.decode(u8a)

      delete o.meta.validFrom
      expect(o).to.deep.eq({
        "meta": {
          "previousValues": { a: undefined },
          "userID": "1",
          "validTo": "9999-01-01T00:00:00.000Z"
        },
        "value": {
          "a": 1
        }
      })
    })
  })

})
