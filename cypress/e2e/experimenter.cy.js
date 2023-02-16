/// <reference types="Cypress" />

import { extractBody, serialize } from '@transformation-dev/cloudflare-do-utils'

const contentType = 'application/json'

async function encodeAndFetch(url, options) {  // TODO: move this to a helper file
  if (!options) options = {}

  if (options.body) {
    options.body = serialize(options.body, contentType)
  }

  let headers
  if (options.headers) {
    headers = new Headers(options.headers)
  } else {
    headers = new Headers()
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', contentType)
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', contentType)
  }
  options.headers = headers

  return await fetch(url, options)
}

async function encodeFetchAndDecode(url, options) {  // TODO: move this to a helper file
  const response = await encodeAndFetch(url, options)
  response.obj = await extractBody(response)
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
