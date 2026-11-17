/// <reference types="cypress" />

import { loginPage } from './pages/LoginPage';

declare global {
  namespace Cypress {
    interface Chainable {
      login(username: string, password: string): Chainable<void>;
      loginBySession(username: string, password: string): Chainable<void>;
      resetDummyData(): Chainable<void>;
    }
  }
}

Cypress.Commands.add('login', (username: string, password: string) => {
  loginPage.login(username, password);
});

Cypress.Commands.add('loginBySession', (username: string, password: string) => {
  cy.session(
    [username],
    () => {
      loginPage.login(username, password);
      cy.url().should('include', '/dashboard');
    },
    {
      validate() {
        cy.getCookie('dummy_session').should('exist');
      },
    }
  );
});

Cypress.Commands.add('resetDummyData', () => {
  cy.request('POST', '/api/test-utils/reset').its('status').should('eq', 200);
});

export {};
