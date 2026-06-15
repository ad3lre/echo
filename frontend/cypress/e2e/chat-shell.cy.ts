import { waitForAppShell } from '../support/e2e';

/**
 * Main column next to the rail: Explore is reachable from the app shell.
 * Guest vs signed-out rail both expose an Explore control (`title` differs; prefix matches both).
 */
describe('chat shell', () => {
  it('opens Explore from the rail', () => {
    cy.visit('/');
    waitForAppShell();
    cy.get('button.explore-trigger[title*="Explore"]', {
      timeout: 60_000,
    })
      .first()
      .click();
    cy.contains('h1', 'Find your next corner of Echo.', {
      timeout: 60_000,
    }).should('be.visible');
  });
});
