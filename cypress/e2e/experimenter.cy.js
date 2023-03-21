/// <reference types="Cypress" />

import { requestOutResponseIn } from '@transformation-dev/cloudflare-do-utils'

context('Concurrency Experimenter', () => {
  let response

  it('should stay consistent', () => {
    cy.wrap(null).then(async () => {
      response = await requestOutResponseIn('/api/do/experimenter/v2?name=Larry')
      expect(`HELLO ${response.content.name.toUpperCase()}!`).to.equal(response.content.greeting)
      const { idString } = response.content

      cy.wrap(null).then(async () => {
        response = await requestOutResponseIn(`/api/do/experimenter/v2/${idString}?nombre=John`)  // intentional typo
        expect(response.status).to.equal(500)

        cy.wrap(null).then(async () => {
          response = await requestOutResponseIn(`/api/do/experimenter/v2/${idString}`)
          expect(`HELLO ${response.content.name.toUpperCase()}!`).to.equal(response.content.greeting)
          expect(response.content.name).to.equal('Larry')
        })
      })
    })
  })

  it('should not stay consistent', () => {
    cy.wrap(null).then(async () => {
      response = await requestOutResponseIn('/api/do/experimenter/v3?name=Larry')
      expect(`HELLO ${response.content.name.toUpperCase()}!`).to.equal(response.content.greeting)
      const { idString } = response.content

      cy.wrap(null).then(async () => {
        response = await requestOutResponseIn(`/api/do/experimenter/v3/${idString}?nombre=John`)  // intentional typo
        expect(response.status).to.equal(500)

        cy.wrap(null).then(async () => {
          response = await requestOutResponseIn(`/api/do/experimenter/v3/${idString}`)
          // eslint-disable-next-line no-unused-expressions
          expect(response.content.name).to.be.null  // ESLint doesn't like this but it works fine. Go figure?
          expect(response.content.greeting).to.equal('HELLO LARRY!')
        })
      })
    })
  })
})
