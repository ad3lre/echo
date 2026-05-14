// Global E2E setup and shared commands (Cypress support file).

/** Vite dev origin (matches `cypress.config.ts` baseUrl). */
export const E2E_ORIGIN = 'http://localhost:8080';

/** Echo HTTP API when addressing the backend directly (bypasses Vite proxy). */
export const E2E_BACKEND_ORIGIN = 'http://127.0.0.1:3000';
