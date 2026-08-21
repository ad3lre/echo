// Global E2E setup and shared commands (Cypress support file).

/** Benign cold-start / stale-cache `/auth/me` 401s must not fail Cypress specs. */
Cypress.on('uncaught:exception', (err) => {
  if (err.name === 'AuthApiError' && /sign in again/i.test(err.message ?? '')) {
    return false;
  }
});

beforeEach(() => {
  cy.clearLocalStorage();
});

/** Vite dev origin (matches `cypress.config.ts` baseUrl). */
export const E2E_ORIGIN = 'http://localhost:8080';

/** Echo HTTP API when addressing the backend directly (bypasses Vite proxy). */
export const E2E_BACKEND_ORIGIN = 'http://127.0.0.1:3000';

/** App shell is mounted under the boot gate overlay until fast-reveal (~600ms). */
export function waitForAppShell(): void {
  cy.get('[data-cy=app-layout]', { timeout: 60_000 }).should('exist');
  cy.get('.echo-boot-gate', { timeout: 15_000 }).should('not.exist');
  cy.get('[data-cy=app-layout]').should('be.visible');
}
