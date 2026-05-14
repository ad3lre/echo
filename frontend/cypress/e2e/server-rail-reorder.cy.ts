/**
 * Server rail uses pointer-driven reorder (desktop mouse). This spec anchors the
 * reorder root + icon hooks in the app shell; full drag requires 2+ joined servers.
 */
describe('server rail reorder', () => {
  it('exposes server rail reorder root in the app shell', () => {
    cy.visit('/');
    cy.get('[data-cy=app-layout]', { timeout: 60_000 }).should('be.visible');
    cy.get('[data-cy=server-rail-reorder-root]', { timeout: 60_000 }).should(
      'exist',
    );
  });

  it('lists server rail icons when the mock stack has joined guilds', () => {
    cy.visit('/');
    cy.get('[data-cy=app-layout]', { timeout: 60_000 }).should('be.visible');
    cy.get('body').then(($body) => {
      const icons = $body.find('[data-cy=server-rail-icon]');
      if (icons.length >= 2) {
        cy.wrap(icons).first().should('be.visible');
        cy.wrap(icons).eq(1).should('be.visible');
      }
    });
  });
});
