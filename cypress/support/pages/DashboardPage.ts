export class DashboardPage {
  assertLoaded() {
    cy.url().should('include', '/dashboard');
    cy.contains('Welcome').should('be.visible');
  }

  assertUserCount(expected: number | string) {
    cy.get('[data-testid="stat-users"]').should('contain', String(expected));
  }

  assertOrderCount(expected: number | string) {
    cy.get('[data-testid="stat-orders"]').should('contain', String(expected));
  }

  createUser(name: string, email: string, role = 'sdet') {
    cy.get('#new-user-name').clear().type(name);
    cy.get('#new-user-email').clear().type(email);
    cy.get('#new-user-role').select(role);
    cy.get('#create-user-btn').click();
  }

  placeOrder(quantity: number) {
    cy.get('#order-qty').clear().type(String(quantity));
    cy.get('#place-order-btn').click();
  }

  assertFlashMessage(message: string) {
    cy.get('[data-testid="flash-message"]').should('contain', message);
  }
}

export const dashboardPage = new DashboardPage();
