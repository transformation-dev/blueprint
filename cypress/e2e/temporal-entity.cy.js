/* eslint-disable no-shadow */
/// <reference types="Cypress" />

import { requestOutResponseIn } from '@transformation-dev/cloudflare-do-utils'

context('TemporalEntity', () => {
  // Using fetch() instead of cy.request() because I couldn't get cy.request() to work for binary data
  // Had to merge four tests into one so this test would be independent of the others
  it('should allow PUT, PATCH delta, GET, DELETE, PATCH undelete, and GET entity-meta', () => {
    const options = {
      method: 'PUT',  // Normally, you'd want to use POST for the original but PUT and POST are equivalent when there is no prior version
      body: { value: { a: 1, b: 2 }, userID: '1' },
    }

    cy.wrap(null).then(async () => {
      const response = await requestOutResponseIn('/api/do/*/*', options)
      expect(response.status).to.eq(201)
      expect(response.headers.get('Content-Type')).to.eq('application/cbor')

      const o = response.content
      expect(o.idString).to.be.a('string')
      expect(o.meta.validFrom).to.be.a('string')

      const { idString } = o
      const t1 = o.meta.validFrom
      delete o.meta.validFrom
      console.log('o', o)
      expect(o).to.deep.eq({
        idString,
        meta: {
          previousValues: { a: undefined, b: undefined },
          userID: '1',
          validTo: '9999-01-01T00:00:00.000Z',
          type: '*',
          version: '*',
        },
        value: { a: 1, b: 2 },
        warnings: [],
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
          'If-Unmodified-Since': lastValidFromISOString,
        },
      }

      cy.wrap(null).then(async () => {
        const response = await requestOutResponseIn(`/api/do/*/*/${idString}`, options2)
        expect(response.status).to.eq(200)

        const o = response.content

        expect(o).to.deep.eq({
          idString,
          meta: {
            previousValues: { a: 1, b: 2 },
            userID: '2',
            validFrom: newValidFromISOString,
            impersonatorID: 'impersonator1',
            validTo: '9999-01-01T00:00:00.000Z',
            type: '*',
            version: '*',
          },
          value: { a: 10 },
          warnings: [],
        })

        const options = {
          method: 'DELETE',
          body: {
            userID: '3',
          },
        }

        cy.wrap(null).then(async () => {
          const response = await requestOutResponseIn(`/api/do/*/*/${idString}`, options)
          expect(response.status).to.eq(204)

          const options3 = {
            method: 'GET',
          }

          cy.wrap(null).then(async () => {
            const response = await requestOutResponseIn(`/api/do/*/*/${idString}`, options3)
            expect(response.status).to.eq(404)

            const o = response.content

            expect(o.error.message).to.eq('GET on deleted TemporalEntity not allowed. Use POST to "query" and set includeDeleted to true')
            expect(o.error.status).to.eq(404)

            const options4 = {
              method: 'GET',
            }

            cy.wrap(null).then(async () => {
              const response = await requestOutResponseIn(`/api/do/*/*/${idString}/entity-meta`, options4)
              expect(response.status).to.eq(200)

              const o = response.content

              expect(o.timeline.length).to.eq(3)

              const options5 = {
                method: 'GET',
              }

              cy.wrap(null).then(async () => {
                const response = await requestOutResponseIn(`/api/do/*/*/${idString}`, options5)
                expect(response.status).to.eq(404)

                const options6 = {
                  method: 'PATCH',
                  body: {
                    undelete: true,
                    userID: '4',
                  },
                }

                cy.wrap(null).then(async () => {
                  const response = await requestOutResponseIn(`/api/do/*/*/${idString}`, options6)
                  expect(response.status).to.eq(200)
                })
              })
            })
          })
        })
      })
    })
  })

  it('should fail with 428 on a PUT after POST without an If-Unmodified-Since header (the second fetch() below)', () => {
    const options = {
      method: 'POST',
      body: {
        value: { c: 100 },
        userID: '1',
      },
    }

    cy.wrap(null).then(async () => {
      const response = await requestOutResponseIn('/api/do/*/*', options)
      expect(response.status, 'Original POST').to.eq(201)
      const o5 = response.content
      const { idString } = o5

      const options4 = {
        method: 'PUT',
        body: {
          value: { c: 200 },
          userID: '2',
        },
      }

      const response2 = await requestOutResponseIn(`/api/do/*/*/${idString}`, options4)
      expect(response2.status, '2nd PUT with missing If-Unmodified-Since').to.eq(428)
      const o2 = response2.content
      expect(o2.error.message).to.eq('required If-Unmodified-Since header for TemporalEntity PUT is missing')
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
      const response = await requestOutResponseIn('/api/do/*/*', options)
      expect(response.status, '1st call to fetch() to set date far into future').to.eq(201)
      const o5 = response.content
      const { idString } = o5

      const options4 = {
        method: 'PUT',
        body: {
          value: { c: 200 },
          userID: '2',
        },
        headers: {
          'If-Unmodified-Since': o5.meta.validFrom,
        },
      }

      const response2 = await requestOutResponseIn(`/api/do/*/*/${idString}`, options4)
      const o = response2.content
      expect(response2.status, '2nd call to fetch() to confirm validFrom is 1ms later').to.eq(200)
      expect(o.meta.validFrom).to.eq(newValidFromISOString)
    })
  })
})
