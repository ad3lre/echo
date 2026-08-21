import { GOOGLE_INTEGRATION_ENABLED } from '@shared/integrationKillSwitches';

/**
 * Google SSO entry points (login modal, welcome gate).
 * Controlled by {@link GOOGLE_INTEGRATION_ENABLED} in `contracts/integrationKillSwitches.ts`.
 */
export const GOOGLE_SSO_SIGNIN_UI_ENABLED = GOOGLE_INTEGRATION_ENABLED;
