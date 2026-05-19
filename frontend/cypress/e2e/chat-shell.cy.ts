/**
 * Main column next to the rail: Explore is reachable from the app shell.
 * Guest vs signed-out rail both expose an Explore control (`title` differs; prefix matches both).
 */
describe('chat shell', () => {
  it('opens Explore from the rail', () => {
    cy.visit('/');
    cy.get('[data-cy=app-layout]', { timeout: 60_000 }).should('be.visible');
    cy.get('button.explore-trigger[title^="Explore "]', {
      timeout: 60_000,
    }).click();
    cy.contains('h1', 'Find a server to join', { timeout: 60_000 }).should(
      'be.visible',
    );
  });
});
