/// <reference types="Cypress" />

context('Authentication', () => {

  it('should only be able to get to pages where allowUnauthenticated=true', () => {
    cy.visit('/#/')

    cy.get("#logout")
      .click()

    cy.get("#toast-close")
      .click()
  })

  it('should display an error on a blank email', () => {
    cy.visit("/#/plan")
      .get("#send-code")
      .click()

    cy.get("#toast-message")
      .should("contain", "Invalid email")

    cy.get("#toast-close")
      .click()
  })

  it('should declare success when an email is sent', () => {
    cy.intercept('/api/passwordless-login/send-code').as('sendCode')

    cy.visit("/#/plan")
      .get("#email")
      .type("whatever@mailinator.com")
      .get("#send-code")
      .click()

    cy.wait('@sendCode')

    cy.get("#toast-message")
      .should("contain", "Code sent")

    cy.get("#toast-close")
      .click()
  })

  it('should display an error on a blank code', () => {
    cy.visit("/#/plan")
      .get("#verify-code")
      .click()

    cy.get("#toast-message")
      .should("contain", "Invalid code")

    cy.get("#toast-close")
      .click()
  })

  it('should display an error when a bad code is entered', () => {
    cy.visit("/#/plan")
      .get("#code")
      .type("some-bad-code")
      .get("#verify-code")
      .click()

    cy.get("#toast-message")
      .should("contain", "Invalid code")

    cy.get("#toast-close")
      .click()
  })

  it('should go to the plan page when a good code is entered', () => {
    cy.visit("/#/plan")
      .get("#code")
      .type(Cypress.env('TESTING_OVERRIDE_CODE'))
      .get("#verify-code")
      .click()
    
    cy.get("#toast-close")
      .click()

    cy.get("#todo-formulation-grid")
  })

  it('should display a message when you log out', () => {
    cy.get("#logout")
      .click()

    cy.get("#toast-message")
      .should("contain", "You are logged out")

    cy.get("#toast-close")
      .click()
  })

  // eslint-disable-next-line no-undef
  afterEach(() => {
    cy.get("#logout")
      .click()

    cy.get("#toast-close")
      .click()
  })

})
