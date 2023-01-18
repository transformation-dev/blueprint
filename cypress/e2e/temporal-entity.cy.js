/// <reference types="Cypress" />

import { Encoder } from 'cbor-x'
const cborSC = new Encoder({ structuredClone: true })

async function encodeAndFetch(url, options) {
  if (options.body) {
    const u8a = cborSC.encode(options.body)
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

async function encodeFetchAndDecode(url, options) {
  const response = await encodeAndFetch(url, options)
  const ab = await response.arrayBuffer()
  if (ab) {
    const u8a = new Uint8Array(ab)
    const o = cborSC.decode(u8a)
    response.CBOR_SC = o
  }
  return response
}

context('TemporalEntity', () => {
  
  it('should respond with 415 on PUT with Content-Type header application/json', () => {
    const options = {
      method: 'PUT',
      body: { value: { a: 1, b: 2 }, userID: '1' },
      headers: {
        'Content-Type': 'application/json',
      },
    }

    cy.wrap(null).then(async () => {
      const response = await encodeFetchAndDecode('/api/temporal-entity/*', options)
      expect(response.status).to.eq(415)
    })
  })

  it('should respond with 406 on PUT with Accept header "application/json"', () => {
    const options = {
      method: 'PUT',
      url: '/api/temporal-entity/*',
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

  it('should respond with 415 because the content was not encoded in cbor-sc', () => {
    const options = {
      method: 'PUT',
      url: '/api/temporal-entity/*',
      body: { a: 1 },
      failOnStatusCode: false,
      headers: {
        'Content-Type': 'application/cbor-sc',
        'Accept': 'application/cbor-sc',
      }
    }
    cy.request(options).as('request')
    cy.get('@request').then(response => {
      expect(response.status).to.eq(415)
    })
  })

  // Using fetch() instead of cy.request() because I couldn't get cy.request() to work for binary data
  // Had to merge four tests into one so this test would be independent of the others
  it('should allow PUT, PATCH delta, GET, DELETE, PATCH undelete, and GET entity-meta', () => {
    let id
    let t1
    let t2
    let oAfterPatch

    const options = {
      method: 'PUT',
      body: { value: { a: 1, b: 2 }, userID: '1' },
    }

    cy.wrap(null).then(async () => {
      const response = await encodeFetchAndDecode('/api/temporal-entity/*', options)
      expect(response.status).to.eq(200)
      expect(response.headers.get('Content-Type')).to.eq('application/cbor-sc')

      const o = response.CBOR_SC
      expect(o.id).to.be.a('string')
      expect(o.meta.validFrom).to.be.a('string')
      expect(response.headers.get('ETag')).to.eq(o.meta.eTag)

      id = o.id
      t1 = o.meta.validFrom
      const eTag1 = o.meta.eTag
      delete o.meta.validFrom
      delete o.meta.eTag
      expect(o).to.deep.eq({
        "id": id,
        "type": "*",
        "version": "v1",
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

      const options2 = {
        method: 'PATCH',
        body: {
          delta: { a: 10, b: undefined },
          userID: '2',
          validFrom: newValidFromISOString,
          impersonatorID: 'impersonator1',
        },
        headers: {
          'If-Match': eTag1,
        },
      }

      cy.wrap(null).then(async () => {
        const response = await encodeFetchAndDecode(`/api/temporal-entity/*/${id}`, options2)
        expect(response.status).to.eq(200)

        const o = response.CBOR_SC

        expect(response.headers.get('ETag')).to.eq(o.meta.eTag)

        oAfterPatch = structuredClone(o)

        t2 = o.meta.validFrom
        const eTag2 = o.meta.eTag
        delete o.meta.eTag
        expect(o).to.deep.eq({
          "id": id,
          "type": "*",
          "version": "v1",
          "meta": {
            "previousValues": { a: 1, b: 2 },
            "userID": "2",
            "validFrom": newValidFromISOString,
            "impersonatorID": "impersonator1",
            "validTo": "9999-01-01T00:00:00.000Z",
          },
          "value": { "a": 10 }
        })

        const options = {
          method: 'DELETE',
          body: {
            userID: '3',
          },
        }

        cy.wrap(null).then(async () => {
          const response = await encodeAndFetch(`/api/temporal-entity/*/${id}`, options)
          expect(response.status).to.eq(204)

          const options3 = {
            method: 'GET',
          }

          cy.wrap(null).then(async () => {
            const response = await encodeFetchAndDecode(`/api/temporal-entity/*/${id}`, options3)
            expect(response.status).to.eq(404)

            const o = response.CBOR_SC

            expect(o.error.message).to.eq('GET on deleted TemporalEntity not allowed. Use POST to "query" and set includeDeleted to true')
            expect(o.error.status).to.eq(404)

            const options4 = {
              method: 'GET',
            }

            cy.wrap(null).then(async () => {
              const response = await encodeFetchAndDecode(`/api/temporal-entity/*/${id}/entity-meta`, options4)
              expect(response.status).to.eq(200)

              const o = response.CBOR_SC

              expect(response.headers.get('ETag')).to.eq(o.eTags.at(-1))
              expect(o.timeline.length).to.eq(3)

              const options5 = {
                method: 'GET',
              }

              cy.wrap(null).then(async () => {
                const response = await encodeFetchAndDecode(`/api/temporal-entity/*/${id}`, options5)
                expect(response.status).to.eq(404)

                const options6 = {
                  method: 'PATCH',
                  body: {
                    undelete: true,
                    userID: '4',
                  },
                }

                cy.wrap(null).then(async () => {
                  const response = await encodeFetchAndDecode(`/api/temporal-entity/*/${id}`, options6)
                  expect(response.status).to.eq(200)
                })
              })
            })
          })
        })
      })
    })
  })

  it('should fail with 428 on a second PUT without an If-Match header (the second fetch() below)', () => {
    const options = {
      method: 'PUT',
      body: {
        value: { c: 100 },
        userID: '1',
      }
    }

    cy.wrap(null).then(async () => {
      const response = await encodeFetchAndDecode(`/api/temporal-entity/*`, options)
      expect(response.status, '1st PUT').to.eq(200)
      const o5 = response.CBOR_SC
      const id = o5.id

      const options4 = {
        method: 'PUT',
        body: {
          value: { c: 200 },
          userID: '2',
        }
      }
      
      const response2 = await encodeFetchAndDecode(`/api/temporal-entity/*/${id}`, options4)
      expect(response2.status, '2nd PUT with missing If-Match').to.eq(428)
      const o2 = response2.CBOR_SC
      expect(response2.headers.get('Status-Text')).to.eq(o2.error.message)
      expect(o2.value).to.deep.eq({ c: 100 })
    })
  })

  it('should auto-increment validFrom when not specified (the second fetch() below)', () => {
    const lastValidFromISOString = '9900-01-01T00:00:00.000Z'
    const lastValidFromDate = new Date(lastValidFromISOString)
    const newValidFromDate = new Date(lastValidFromDate.getTime() + 1)  // 1 millisecond later
    const newValidFromISOString = newValidFromDate.toISOString()

    const options = {
      method: 'PUT',
      body: {
        value: { c: 100 },
        userID: '1',
        validFrom: lastValidFromISOString,
      },
    }

    cy.wrap(null).then(async () => {
      const response = await encodeFetchAndDecode(`/api/temporal-entity/*`, options)
      expect(response.status, '1st call to fetch() to set date far into future').to.eq(200)
      const eTagFromHeaders = response.headers.get('ETag')
      const o5 = response.CBOR_SC
      const id = o5.id
      const eTagFromMeta = o5.meta.eTag
      expect(eTagFromHeaders).to.eq(eTagFromMeta)

      const options4 = {
        method: 'PUT',
        body: {
          value: { c: 200 },
          userID: '2',
        },
        headers: {
          'If-Match': eTagFromHeaders,
        },
      }

      const response2 = await encodeFetchAndDecode(`/api/temporal-entity/*/${id}`, options4)
      expect(response2.status, '2nd call to fetch() to confirm validFrom is 1ms later').to.eq(200)
      const o = response2.CBOR_SC
      expect(o.meta.validFrom).to.eq(newValidFromISOString)
    })
  })

})
