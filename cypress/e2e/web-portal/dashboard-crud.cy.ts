import { dashboardPage } from '../../support/pages/DashboardPage';

describe('[web-portal] Dashboard User & Order CRUD E2E @regression @e2e', () => {
  const username = Cypress.env('username') || 'admin';
  const password = Cypress.env('password') || 'password';

  beforeEach(() => {
    cy.resetDummyData();
    cy.loginBySession(username, password);
    cy.visit('/dashboard');
    dashboardPage.assertLoaded();
  });

  it('[positive] should create a new user via UI and update user stats', () => {
    dashboardPage.assertUserCount(4);

    dashboardPage.createUser('E2E Test Engineer', 'e2e.engineer@qa-corp.dev', 'sdet');

    dashboardPage.assertFlashMessage('User created successfully');
    dashboardPage.assertUserCount(5);
    cy.contains('e2e.engineer@qa-corp.dev').should('be.visible');
  });

  it('[positive] should place a new order via UI and update order count', () => {
    dashboardPage.assertOrderCount(2);

    dashboardPage.placeOrder(2);

    dashboardPage.assertFlashMessage('Order placed successfully');
    dashboardPage.assertOrderCount(3);
  });

  it('[edge] should display insufficient stock error when ordering above inventory', () => {
    dashboardPage.placeOrder(9999);
    dashboardPage.assertFlashMessage('Insufficient stock');
    dashboardPage.assertOrderCount(2);
  });
});
