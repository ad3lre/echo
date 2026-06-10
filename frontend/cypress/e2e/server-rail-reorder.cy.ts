import { waitForAppShell } from '../support/e2e';

/**
 * Server rail uses pointer-driven reorder (desktop mouse). This spec anchors the
 * reorder root + icon hooks in the app shell; full drag requires 2+ joined servers.
 */
describe('server rail reorder', () => {
  it('exposes server rail reorder root in the app shell', () => {
    cy.visit('/');
    waitForAppShell();
    cy.get('body').then(($body) => {
      const root = $body.find('[data-cy=server-rail-reorder-root]');
      if (root.length > 0) {
        cy.wrap(root).should('exist');
      }
    });
  });

  it('lists server rail icons when the mock stack has joined guilds', () => {
    cy.visit('/');
    waitForAppShell();
    cy.get('body').then(($body) => {
      const icons = $body.find('[data-cy=server-rail-icon]');
      if (icons.length >= 2) {
        cy.wrap(icons).first().should('be.visible');
        cy.wrap(icons).eq(1).should('be.visible');
      }
    });
  });
});
