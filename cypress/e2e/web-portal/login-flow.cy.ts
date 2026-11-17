import { loginPage } from '../../support/pages/LoginPage';
import { dashboardPage } from '../../support/pages/DashboardPage';

describe('[web-portal] Authentication E2E Flow @smoke @e2e', () => {
  const username = Cypress.env('username') || 'admin';
  const password = Cypress.env('password') || 'password';

  beforeEach(() => {
    cy.resetDummyData();
    cy.visit('/');
  });

  it('[positive] should display the landing page with login action', () => {
    cy.get('h1').should('exist');
    cy.contains('Login').should('be.visible');
  });

  it('[positive] should login successfully with valid credentials', () => {
    loginPage.login(username, password);
    dashboardPage.assertLoaded();
  });

  it('[negative] should show error message for invalid credentials', () => {
    loginPage.login('invalid_user', 'wrong_password');
    loginPage.assertErrorVisible('Invalid credentials');
  });

  it('[edge] should redirect unauthenticated /dashboard access back to /login', () => {
    cy.clearCookies();
    cy.visit('/dashboard');
    cy.url().should('include', '/login');
  });
});
