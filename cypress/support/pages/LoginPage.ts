export class LoginPage {
  visit() {
    cy.visit('/login');
  }

  fillCredentials(username: string, password: string) {
    cy.get('#username').clear().type(username);
    cy.get('#password').clear().type(password);
  }

  submit() {
    cy.get('#login-btn').click();
  }

  login(username: string, password: string) {
    this.visit();
    this.fillCredentials(username, password);
    this.submit();
  }

  assertErrorVisible(message: string) {
    cy.contains(message).should('be.visible');
    cy.url().should('include', '/login');
  }
}

export const loginPage = new LoginPage();
