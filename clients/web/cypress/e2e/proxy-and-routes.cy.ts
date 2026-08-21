import { E2E_ORIGIN } from '../support/e2e';

describe('vite proxy and routes', () => {
  it('proxies health to the backend', () => {
    cy.request('GET', `${E2E_ORIGIN}/api/v1/health`)
      .its('status')
      .should('eq', 200);
    cy.request('GET', `${E2E_ORIGIN}/api/v1/health`).then((res) => {
      expect(res.body).to.have.property('status', 'ok');
      expect(res.body).to.have.property('db');
      expect(res.body).to.have.property('nats');
    });
  });

  it('renders the reset-password surface', () => {
    cy.visit('/reset-password');
    cy.get('h1.reset-title', { timeout: 60_000 }).should(
      'contain.text',
      'Reset password',
    );
    cy.get('label[for="rp-token"]', { timeout: 60_000 }).should(
      'contain.text',
      'Reset token',
    );
  });

  it('renders the forgot-password surface', () => {
    cy.visit('/forgot-password');
    cy.get('h1.forgot-title', { timeout: 60_000 }).should(
      'contain.text',
      'Forgot password',
    );
    cy.get('label[for="fp-email"]', { timeout: 60_000 }).should(
      'contain.text',
      'Email',
    );
  });
});
