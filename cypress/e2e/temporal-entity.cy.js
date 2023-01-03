/// <reference types="Cypress" />

import { Encoder } from 'cbor-x'
const cborSC = new Encoder({ structuredClone: true })

context('Temporal Entity', () => {
  
  it('should respond with 415 on PUT with Content-Type header application/json', () => {
    const o = { value: { a: 1, b: 2 }, userID: '1' }
    const u8a = cborSC.encode(o)
    const options = {
      method: 'PUT',
      body: u8a,
      headers: {
        'Content-Type': 'application/json',
      },
    }

    cy.wrap(null).then(async () => {
      const response = await fetch('/api/temporal-entity', options)
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

  // Using fetch() instead of cy.request() because I couldn't get cy.request() to work for binary data
  // Had to merge four tests into one so this test would be independent of the others
  it('should allow PUT, PATCH, GET, and GET entity-meta', () => {
    let id
    let t1
    let t2
    let oAfterPatch

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
      expect(response.headers.get('Content-Type')).to.eq('application/cbor-sc')

      const ab = await response.arrayBuffer()
      const u8a = new Uint8Array(ab)
      const o = cborSC.decode(u8a)

      expect(o.meta.id).to.be.a('string')
      expect(o.meta.validFrom).to.be.a('string')
      expect(response.headers.get('ETag')).to.eq(o.meta.validFrom)

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

      const lastValidFromISOString = t1
      const lastValidFromDate = new Date(lastValidFromISOString)
      const newValidFromDate = new Date(lastValidFromDate.getTime() + 1)  // 1 millisecond later
      const newValidFromISOString = newValidFromDate.toISOString()

      const o2 = { 
        delta: { a: 10, b: undefined }, 
        userID: '2', 
        validFrom: newValidFromISOString,
        impersonatorID: 'impersonator1',
      }
      const u8a2 = cborSC.encode(o2)
      const options2 = {
        method: 'PATCH',
        body: u8a2,
        headers: {
          'Content-Type': 'application/cbor-sc',
          'Accept': 'application/cbor-sc',
          'If-Match': lastValidFromISOString,
        },
      }

      cy.wrap(null).then(async () => {
        const response = await fetch(`/api/temporal-entity/${id}`, options2)
        expect(response.status).to.eq(200)

        const ab = await response.arrayBuffer()
        const u8a = new Uint8Array(ab)
        const o = cborSC.decode(u8a)

        expect(response.headers.get('ETag')).to.eq(o.meta.validFrom)

        oAfterPatch = structuredClone(o)

        t2 = o.meta.validFrom
        expect(o).to.deep.eq({
          "meta": {
            "previousValues": { a: 1, b: 2 },
            "userID": "2",
            "validFrom": newValidFromISOString,
            "impersonatorID": "impersonator1",
            "validTo": "9999-01-01T00:00:00.000Z",
            "id": id,
          },
          "value": { "a": 10 }
        })

        const options3 = {
          method: 'GET',
          headers: {
            'Content-Type': 'application/cbor-sc',
            'Accept': 'application/cbor-sc',
          },
        }

        cy.wrap(null).then(async () => {
          const response = await fetch(`/api/temporal-entity/${id}`, options3)
          expect(response.status).to.eq(200)

          const ab = await response.arrayBuffer()
          const u8a = new Uint8Array(ab)
          const o = cborSC.decode(u8a)
          
          expect(response.headers.get('ETag')).to.eq(o.meta.validFrom)
          expect(o).to.deep.eq(oAfterPatch)

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

            expect(response.headers.get('ETag')).to.eq(t2)
            expect(o.timeline).to.deep.eq([t1, t2])
          })
        })
      })
    })
  })

  // TODO: test that a second PUT without an If-Match header fails with 412
  it('should fail with 412 on a second PUT without an If-Match header (the second fetch() below)', () => {
    const o = {
      value: { c: 100 },
      userID: '1',
    }
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
      const response = await fetch(`/api/temporal-entity`, options)
      expect(response.status, '1st PUT').to.eq(200)
      const ab = await response.arrayBuffer()
      const u8a = new Uint8Array(ab)
      const o5 = cborSC.decode(u8a)
      const id = o5.meta.id

      const o4 = {
        value: { c: 200 },
        userID: '2',
      }
      const u8a4 = cborSC.encode(o4)
      const options4 = {
        method: 'PUT',
        body: u8a4,
        headers: {
          'Content-Type': 'application/cbor-sc',
          'Accept': 'application/cbor-sc',
        },
      }
      
      const response2 = await fetch(`/api/temporal-entity/${id}`, options4)
      expect(response2.status, '2nd PUT with missing If-Match').to.eq(412)
      const ab2 = await response2.arrayBuffer()
      const u8a2 = new Uint8Array(ab2)
      const o2 = cborSC.decode(u8a2)
      expect(response2.headers.get('Status-Text')).to.eq(o2.error.message)
    })
  })

  it('should auto-increment validFrom when not specified (the second fetch() below)', () => {
    const lastValidFromISOString = '9900-01-01T00:00:00.000Z'
    const lastValidFromDate = new Date(lastValidFromISOString)
    const newValidFromDate = new Date(lastValidFromDate.getTime() + 1)  // 1 millisecond later
    const newValidFromISOString = newValidFromDate.toISOString()

    const o = {
      value: { c: 100 },
      userID: '1',
      validFrom: lastValidFromISOString,
    }
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
      const response = await fetch(`/api/temporal-entity`, options)
      expect(response.status, '1st call to fetch() to set date far into future').to.eq(200)

      const o4 = {
        value: { c: 200 },
        userID: '2',
      }
      const u8a4 = cborSC.encode(o4)
      const options4 = {
        method: 'PUT',
        body: u8a4,
        headers: {
          'Content-Type': 'application/cbor-sc',
          'Accept': 'application/cbor-sc',
          'If-Match': lastValidFromISOString,
        },
      }
      const ab = await response.arrayBuffer()
      const u8a = new Uint8Array(ab)
      const o5 = cborSC.decode(u8a)
      const id = o5.meta.id

      const response2 = await fetch(`/api/temporal-entity/${id}`, options4)
      expect(response2.status, '2nd call to fetch() to confirm validFrom is 1ms later').to.eq(200)

      const ab2 = await response2.arrayBuffer()
      const u8a2 = new Uint8Array(ab2)
      const o = cborSC.decode(u8a2)
      expect(o.meta.validFrom).to.eq(newValidFromISOString)
    })
  })

})
