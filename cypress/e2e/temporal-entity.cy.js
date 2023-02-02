/// <reference types="Cypress" />

import { Encoder, encode, decode } from 'cbor-x'
const cborSC = new Encoder({ structuredClone: true })

async function encodeAndFetch(url, options) {
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

async function encodeFetchAndDecode(url, options) {
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

context('TemporalEntity', () => {

  // TODO: Test to confirm that for DAGs the nodes that are referenced twice are actually the same object; === rather than just deep.eq
  
  it('should respond with 415 on POST with Content-Type header application/json', () => {
    const options = {
      method: 'POST',
      body: { value: { a: 1, b: 2 }, userID: '1' },
      headers: {
        'Content-Type': 'application/json',
      },
    }

    cy.wrap(null).then(async () => {
      const response = await encodeFetchAndDecode('/api/temporal-entity/*/*', options)
      expect(response.status).to.eq(415)
    })
  })

  it('should respond with 406 on POST with Accept header "application/json"', () => {
    const options = {
      method: 'POST',
      url: '/api/temporal-entity/*/*',
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
      method: 'POST',
      url: '/api/temporal-entity/*/*',
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
    const options = {
      method: 'PUT',  // Normally, you'd want to use POST for the original but PUT and POST are equivalent when there is no prior version
      body: { value: { a: 1, b: 2 }, userID: '1' },
    }

    cy.wrap(null).then(async () => {
      const response = await encodeFetchAndDecode('/api/temporal-entity/*/*', options)
      expect(response.status).to.eq(201)
      expect(response.headers.get('Content-Type')).to.eq('application/cbor-sc')

      const o = response.CBOR_SC
      expect(o.idString).to.be.a('string')
      expect(o.meta.validFrom).to.be.a('string')
      expect(response.headers.get('ETag')).to.eq(o.meta.eTag)

      const idString = o.idString
      const t1 = o.meta.validFrom
      const eTag1 = o.meta.eTag
      delete o.meta.validFrom
      delete o.meta.eTag
      expect(o).to.deep.eq({
        "idString": idString,
        "meta": {
          "previousValues": { a: undefined, b: undefined },
          "userID": "1",
          "validTo": "9999-01-01T00:00:00.000Z",
          "type": "*",
          "version": "*",
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
        const response = await encodeFetchAndDecode(`/api/temporal-entity/*/*/${idString}`, options2)
        expect(response.status).to.eq(200)

        const o = response.CBOR_SC

        expect(response.headers.get('ETag')).to.eq(o.meta.eTag)

        const eTag2 = o.meta.eTag
        delete o.meta.eTag
        expect(o).to.deep.eq({
          "idString": idString,
          "meta": {
            "previousValues": { a: 1, b: 2 },
            "userID": "2",
            "validFrom": newValidFromISOString,
            "impersonatorID": "impersonator1",
            "validTo": "9999-01-01T00:00:00.000Z",
            "type": "*",
            "version": "*",
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
          const response = await encodeAndFetch(`/api/temporal-entity/*/*/${idString}`, options)
          expect(response.status).to.eq(204)

          const options3 = {
            method: 'GET',
          }

          cy.wrap(null).then(async () => {
            const response = await encodeFetchAndDecode(`/api/temporal-entity/*/*/${idString}`, options3)
            expect(response.status).to.eq(404)

            const o = response.CBOR_SC

            expect(o.error.message).to.eq('GET on deleted TemporalEntity not allowed. Use POST to "query" and set includeDeleted to true')
            expect(o.error.status).to.eq(404)

            const options4 = {
              method: 'GET',
            }

            cy.wrap(null).then(async () => {
              const response = await encodeFetchAndDecode(`/api/temporal-entity/*/*/${idString}/entity-meta`, options4)
              expect(response.status).to.eq(200)

              const o = response.CBOR_SC

              expect(o.timeline.length).to.eq(3)

              const options5 = {
                method: 'GET',
              }

              cy.wrap(null).then(async () => {
                const response = await encodeFetchAndDecode(`/api/temporal-entity/*/*/${idString}`, options5)
                expect(response.status).to.eq(404)

                const options6 = {
                  method: 'PATCH',
                  body: {
                    undelete: true,
                    userID: '4',
                  },
                }

                cy.wrap(null).then(async () => {
                  const response = await encodeFetchAndDecode(`/api/temporal-entity/*/*/${idString}`, options6)
                  expect(response.status).to.eq(200)
                })
              })
            })
          })
        })
      })
    })
  })

  it('should fail with 428 on a PUT after POST without an If-Match header (the second fetch() below)', () => {
    const options = {
      method: 'POST',
      body: {
        value: { c: 100 },
        userID: '1',
      }
    }

    cy.wrap(null).then(async () => {
      const response = await encodeFetchAndDecode(`/api/temporal-entity/*/*`, options)
      expect(response.status, 'Original POST').to.eq(201)
      const o5 = response.CBOR_SC
      const idString = o5.idString

      const options4 = {
        method: 'PUT',
        body: {
          value: { c: 200 },
          userID: '2',
        }
      }
      
      const response2 = await encodeFetchAndDecode(`/api/temporal-entity/*/*/${idString}`, options4)
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
      method: 'POST',
      body: {
        value: { c: 100 },
        userID: '1',
        validFrom: lastValidFromISOString,
      },
    }

    cy.wrap(null).then(async () => {
      const response = await encodeFetchAndDecode(`/api/temporal-entity/*/*`, options)
      expect(response.status, '1st call to fetch() to set date far into future').to.eq(201)
      const eTagFromHeaders = response.headers.get('ETag')
      const o5 = response.CBOR_SC
      const idString = o5.idString
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

      const response2 = await encodeFetchAndDecode(`/api/temporal-entity/*/*/${idString}`, options4)
      expect(response2.status, '2nd call to fetch() to confirm validFrom is 1ms later').to.eq(200)
      const o = response2.CBOR_SC
      expect(o.meta.validFrom).to.eq(newValidFromISOString)
    })
  })

})
