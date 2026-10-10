import { waitForAppShell } from '../support/e2e';

describe('server rail reorder', () => {
  beforeEach(() => {
    cy.clearCookies();
    const tag = `rail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    cy.request('POST', '/api/v1/auth/register', {
      username: tag,
      email: `${tag}@echo.test`,
      password: 'password123',
      displayName: 'Rail Verify',
    }).then(({ body }) => {
      for (const name of ['First rail fixture', 'Second rail fixture']) {
        cy.request({
          method: 'POST',
          url: '/api/v1/echo/servers',
          headers: { 'x-csrf-token': body.csrfToken },
          body: { name },
        })
          .its('status')
          .should('eq', 201);
      }
    });
  });

  it('exposes the reorder root and both seeded server icons', () => {
    cy.visit('/');
    waitForAppShell();
    cy.get('[data-cy=server-rail-reorder-root]').should('be.visible');
    cy.get('[data-cy=server-rail-icon]').should('have.length', 2);
    cy.get('[data-cy=server-rail-icon]').first().should('be.visible');
    cy.get('[data-cy=server-rail-icon]').eq(1).should('be.visible');
  });
});
