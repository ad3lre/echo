import { E2E_BACKEND_ORIGIN, waitForAppShell } from '../support/e2e';

/**
 * Requires backend memory + mock API and Vite on :8080 (see root `dev:e2e`).
 * Full run from repo root: `npm run test:e2e` (starts stack, waits on UI, runs Cypress).
 * Manual: `npm run dev:e2e` then `npm run cy:open -w frontend`.
 */
describe('smoke', () => {
  it('reports backend health', () => {
    cy.request('GET', `${E2E_BACKEND_ORIGIN}/api/v1/health`)
      .its('status')
      .should('eq', 200);
  });

  it('loads the app shell', () => {
    cy.visit('/');
    waitForAppShell();
  });

  /**
   * VC regression anchor: mock E2E stack has no LiveKit; this only ensures the SPA mounts.
   * LiveKit + moderation coverage: backend `npm run test:echo:livekit` (needs DB + optional LIVEKIT_*).
   */
  it('loads voice-capable app shell (mock stack)', () => {
    cy.visit('/');
    waitForAppShell();
  });
});
