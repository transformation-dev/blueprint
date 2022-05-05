/// <reference types="Cypress" />

context('Authentication', () => {

  it('should only be able to get to pages where allowUnauthenticated=true', () => {
    cy.visit('/#/')

    cy.get("#logout")
      .click()

  })

  it('should display an error on a blank email', () => {
    cy.visit("/?#/plan")
      .get("#send-code")
      .click()

    cy.get("#toast-message")
      .should("contain", "Invalid email")
  })

  it('should declare success when an email is sent', () => {
    cy.visit("/?#/plan")
      .get("#email")
      .type("whatever@mailinator.com")
      .get("#send-code")
      .click()

    cy.get("#toast-message")
      .should("contain", "Code sent")
  })

  it('should display an error on a blank code', () => {
    cy.visit("/?#/plan")
      .get("#verify-code")
      .click()

    cy.get("#toast-message")
      .should("contain", "Invalid code")
  })

  it('should display an error when a bad code is entered', () => {
    cy.visit("/?#/plan")
      .get("#code")
      .type("some-bad-code")
      .get("#verify-code")
      .click()

    cy.get("#toast-message")
      .should("contain", "Invalid code")
  })

  it('should go to the plan page when a good code is entered', () => {
    cy.visit("/?#/plan")
      .get("#code")
      .type(Cypress.env('TESTING_OVERRIDE_CODE'))
      .get("#verify-code")
      .click()

    cy.get("#todo-formulation-grid")
  })

  // eslint-disable-next-line no-undef
  afterEach(() => {
    cy.get("#logout")
      .click()
  })

})
