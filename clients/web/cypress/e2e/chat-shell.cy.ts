import { waitForAppShell } from '../support/e2e';

/**
 * Main column next to the rail: Explore is reachable from the app shell.
 * Guest auto-mint may already land on public Explore; otherwise use the rail control.
 */
describe('chat shell', () => {
  it('opens Explore from the rail', () => {
    cy.visit('/');
    waitForAppShell();
    cy.get('body').then(($body) => {
      const onExplore = $body
        .find('h1')
        .toArray()
        .some((el) =>
          (el.textContent ?? '').includes('Find your next corner of Echo.'),
        );
      if (!onExplore) {
        cy.get(
          '[data-cy=explore-rail-trigger], button.explore-trigger[title*="Explore"]',
          { timeout: 60_000 },
        )
          .filter(':visible')
          .first()
          .click();
      }
    });
    cy.contains('h1', 'Find your next corner of Echo.', {
      timeout: 60_000,
    }).should('be.visible');
  });
});
