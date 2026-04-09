describe('Login Flow', () => {
  const username = Cypress.env('username') || 'admin';
  const password = Cypress.env('password') || 'password';

  beforeEach(() => {
    // Visit the base URL before each test
    cy.visit('/');
  });

  it('should display the login page', () => {
    cy.get('h1').should('exist');
    // Using a more generic selector for the login button if id is not present
    cy.contains('Login').should('be.visible');
  });

  it('should login successfully with valid credentials', () => {
    // This is a mockup of a login flow. In a real app, 
    // these selectors would match your actual UI.
    cy.visit('/login');
    
    cy.get('input[name="username"]').type(username);
    cy.get('input[name="password"]').type(password);
    cy.get('button[type="submit"]').click();

    // Check if redirect occurred to dashboard or home
    cy.url().should('include', '/dashboard');
    cy.contains('Welcome').should('be.visible');
  });

  it('should show error message for invalid credentials', () => {
    cy.visit('/login');
    
    cy.get('input[name="username"]').type('invalid_user');
    cy.get('input[name="password"]').type('wrong_password');
    cy.get('button[type="submit"]').click();

    // Check for error message visibility
    cy.contains('Invalid credentials').should('be.visible');
    cy.url().should('include', '/login');
  });
});
