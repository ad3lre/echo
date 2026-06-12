/**
 * Inline desktop auth flow.
 *
 * Backs the panel-flip experience that replaces the desktop LoginRegisterModal
 * inside the WelcomeBackExploreGate right panel: welcome → login → register →
 * forgot → mfa are sub-views driven by `view`, mirroring the page-based mobile
 * flow (MobileAuthExperience) but without the phone-specific haptics/biometric
 * detection. Auth success is propagated purely through the session store, which
 * re-renders the gate away — no emit is required.
 */
import { computed, ref } from 'vue';
import {
  AuthApiError,
  authDiscordDesktopHandoffStartUrl,
  authDiscordLoginStart,
  authForgotPassword,
  authGoogleDesktopHandoffStartUrl,
  authGoogleLoginStart,
  authLogin,
  authLoginMfa,
  authPasskeyLoginVerify,
  authRegister,
  authUpgradeGuest,
  isAuthLoginMfaChallenge,
} from '@/api/authClient';
import { translateApiErrorBody } from '@/i18n/apiErrors';
import { echoT } from '@/i18n';
import { messageForDiscordOAuthError } from '@/features/discord/discordIntegrationCopy';
import { messageForGoogleOAuthError } from '@/features/google/googleIntegrationCopy';
import { useAuthSessionStore } from '@/stores/authSession';
import {
  clearPendingDesktopOAuthHandoffNonce,
  createPendingDesktopOAuthHandoffNonce,
  setPendingDesktopOAuthReturnPath,
} from '@/platform/desktopOAuthHandoff';
import {
  isDesktop,
  openExternal,
  startOAuthFlow,
} from '@/platform/desktopBridge';
import { ECHO_PASSKEYS_ENABLED } from '@/config/echoPasskeysEnabled';
import {
  getPasskeyWebCeremonyBlockReason,
  mapPasskeyCeremonyError,
} from '@/utils/passkeyClientSupport';
import {
  browserSupportsPasskeyAutofill,
  cancelPasskeyCeremony,
  passkeyLoginIdentFromRaw,
  prefetchPasskeyLoginOptions,
  runConditionalPasskeyAuthentication,
  runPasskeyAuthenticationCeremony,
} from '@/utils/passkeyWebCeremony';
import {
  computePasswordStrength,
  isValidEmailFormat,
  MIN_ACCOUNT_PASSWORD_LENGTH,
  normalizeEmail,
} from '@/utils/accountValidation';

export type InlineAuthView =
  | 'welcome'
  | 'login'
  | 'register'
  | 'forgot'
  | 'mfa';

const STRENGTH_STRONG_PCT = 82;
const STRENGTH_GOOD_PCT = 58;
const STRENGTH_FAIR_PCT = 36;

export function useInlineAuthFlow(opts: {
  isMockDataMode: () => boolean;
  initialView?: InlineAuthView;
}) {
  const authSession = useAuthSessionStore();
  const isMock = () => opts.isMockDataMode();

  const view = ref<InlineAuthView>(opts.initialView ?? 'welcome');
  const direction = ref<'forward' | 'back'>('forward');

  const submitting = ref(false);
  const errorMessage = ref('');
  const username = ref('');
  const password = ref('');
  const email = ref('');
  const displayName = ref('');
  const forgotEmail = ref('');
  const forgotMessage = ref('');

  const mfaToken = ref<string | null>(null);
  const mfaFactor = ref<'totp' | 'recovery'>('totp');
  const mfaTotpCode = ref('');
  const mfaRecoveryCode = ref('');

  function push(target: Exclude<InlineAuthView, 'welcome'>) {
    direction.value = 'forward';
    errorMessage.value = '';
    view.value = target;
  }

  function pop(target: InlineAuthView = 'welcome') {
    direction.value = 'back';
    errorMessage.value = '';
    view.value = target;
  }

  // Passkey UI is no longer a standalone button: on the login slide we arm
  // conditional mediation (autofill) so a prompt only appears when the user
  // actually has an Echo passkey. `passkeyAvailable` gates the small "use a
  // passkey" affordance that opens the help modal for the remaining edge cases
  // (e.g. a passkey that lives on another device).
  const passkeyAvailable = computed(
    () =>
      ECHO_PASSKEYS_ENABLED &&
      !isMock() &&
      getPasskeyWebCeremonyBlockReason('login') === null,
  );

  const passwordStrength = computed(() =>
    computePasswordStrength(password.value),
  );
  const strengthBarClass = computed(() => {
    const p = passwordStrength.value.fillPct;
    if (p >= STRENGTH_STRONG_PCT) return 'strength-fill--strong';
    if (p >= STRENGTH_GOOD_PCT) return 'strength-fill--good';
    if (p >= STRENGTH_FAIR_PCT) return 'strength-fill--fair';
    return 'strength-fill--weak';
  });

  function readReturnedOauthError(): void {
    try {
      const g = sessionStorage.getItem('echo_google_oauth_error')?.trim();
      if (g) {
        sessionStorage.removeItem('echo_google_oauth_error');
        errorMessage.value = messageForGoogleOAuthError(g);
        return;
      }
      const d = sessionStorage.getItem('echo_discord_oauth_error')?.trim();
      if (d) {
        sessionStorage.removeItem('echo_discord_oauth_error');
        errorMessage.value = messageForDiscordOAuthError(d);
      }
    } catch {
      /* ignore */
    }
  }

  function mapError(err: unknown): string {
    if (err instanceof Error && err.message === 'ACCOUNTS_DISABLED_PREVIEW') {
      return 'Sign-in isn’t available while Echo is in preview mode.';
    }
    if (err instanceof AuthApiError) {
      const c = err.body.code;
      if (c === 'INVALID_MFA_CODE')
        return 'That code doesn’t match. Try again.';
      if (c === 'INVALID_MFA_TOKEN')
        return 'The sign-in step expired. Try logging in again.';
      if (c === 'INVALID_CREDENTIALS')
        return 'That username or password doesn’t match our records.';
      if (c === 'USERNAME_TAKEN')
        return 'That username is already taken. Try another.';
      if (c === 'EMAIL_IN_USE')
        return 'That email is already registered. Try logging in instead.';
      if (c === 'INVALID_EMAIL') return 'Please enter a valid email address.';
      if (c === 'CHALLENGE_EXPIRED')
        return 'That sign-in step expired. Try again.';
      if (c === 'VERIFICATION_FAILED') return 'Verification failed. Try again.';
      return translateApiErrorBody(err.body);
    }
    if (err instanceof Error) return err.message;
    return echoT('common.somethingWentWrong');
  }

  function setAuthError(message: string): void {
    errorMessage.value = message;
  }

  async function completePasskey(
    credential: unknown,
    challengeId: string,
  ): Promise<void> {
    const result = await authPasskeyLoginVerify({
      challengeId,
      credential: credential as Record<string, unknown>,
    });
    if (isAuthLoginMfaChallenge(result)) {
      beginMfaChallenge(result.mfaToken);
      return;
    }
    authSession.setSession(result);
  }

  /**
   * Arm conditional mediation while the login slide is mounted. Resolves only if
   * the user picks an autofilled passkey; aborts/dismissals are silent so the
   * form stays clean for everyone without a passkey.
   */
  async function armConditionalPasskey(): Promise<void> {
    if (!passkeyAvailable.value) return;
    const supported = await browserSupportsPasskeyAutofill().catch(() => false);
    if (!supported) return;
    try {
      const { credential, challengeId } =
        await runConditionalPasskeyAuthentication();
      await completePasskey(credential, challengeId);
    } catch {
      /* aborted on navigation or dismissed by the user — stay silent */
    }
  }

  function stopConditionalPasskey(): void {
    cancelPasskeyCeremony();
  }

  /**
   * Explicit passkey ceremony for the help modal (covers cross-device / QR
   * passkeys autofill cannot surface). Returns an error message, or null on
   * success, so the modal can render its own state.
   */
  async function signInWithPasskey(raw = ''): Promise<string | null> {
    const blocked = getPasskeyWebCeremonyBlockReason('login');
    if (blocked) return blocked;
    try {
      const ident = passkeyLoginIdentFromRaw(raw);
      const { credential, challengeId } =
        await runPasskeyAuthenticationCeremony(ident);
      await completePasskey(credential, challengeId);
      return null;
    } catch (e) {
      void prefetchPasskeyLoginOptions(passkeyLoginIdentFromRaw(raw));
      return mapPasskeyCeremonyError(e, 'login');
    }
  }

  async function startSystemBrowserOauth(
    startUrlFor: (nonce: string) => string,
    startWeb: () => Promise<{ authorizeUrl: string }>,
  ): Promise<void> {
    if (isMock()) return;
    submitting.value = true;
    errorMessage.value = '';
    try {
      if (isDesktop()) {
        const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        setPendingDesktopOAuthReturnPath(returnPath);
        const nonce = createPendingDesktopOAuthHandoffNonce();
        await openExternal(startUrlFor(nonce), { skipSafetyPrompt: true });
        return;
      }
      const { authorizeUrl } = await startWeb();
      startOAuthFlow(authorizeUrl);
    } catch (e) {
      if (isDesktop()) clearPendingDesktopOAuthHandoffNonce();
      setAuthError(mapError(e));
    } finally {
      submitting.value = false;
    }
  }

  function startDiscord(): Promise<void> {
    return startSystemBrowserOauth(
      authDiscordDesktopHandoffStartUrl,
      authDiscordLoginStart,
    );
  }

  function startGoogle(): Promise<void> {
    return startSystemBrowserOauth(
      authGoogleDesktopHandoffStartUrl,
      authGoogleLoginStart,
    );
  }

  function beginMfaChallenge(token: string): void {
    mfaToken.value = token;
    mfaFactor.value = 'totp';
    mfaTotpCode.value = '';
    mfaRecoveryCode.value = '';
    push('mfa');
  }

  async function submitLogin(): Promise<void> {
    if (isMock()) {
      setAuthError(mapError(new Error('ACCOUNTS_DISABLED_PREVIEW')));
      return;
    }
    const u = username.value.trim();
    const p = password.value;
    if (!u || !p) {
      setAuthError('Enter your username or email and password.');
      return;
    }
    submitting.value = true;
    errorMessage.value = '';
    try {
      const result = await authLogin({ username: u, password: p });
      if (isAuthLoginMfaChallenge(result)) {
        beginMfaChallenge(result.mfaToken);
        return;
      }
      authSession.setSession(result);
    } catch (e) {
      setAuthError(mapError(e));
    } finally {
      submitting.value = false;
    }
  }

  async function submitMfa(): Promise<void> {
    const token = mfaToken.value?.trim() ?? '';
    if (!token) {
      setAuthError('Sign-in expired. Try logging in again.');
      return;
    }
    const useTotp = mfaFactor.value === 'totp';
    const code = mfaTotpCode.value.trim();
    const recoveryCode = mfaRecoveryCode.value.trim();
    if (useTotp && !/^\d{6}$/.test(code)) {
      setAuthError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    if (!useTotp && !recoveryCode) {
      setAuthError('Enter a recovery code.');
      return;
    }
    submitting.value = true;
    errorMessage.value = '';
    try {
      const session = await authLoginMfa(
        useTotp ? { mfaToken: token, code } : { mfaToken: token, recoveryCode },
      );
      authSession.setSession(session);
      mfaToken.value = null;
    } catch (e) {
      setAuthError(mapError(e));
    } finally {
      submitting.value = false;
    }
  }

  function validateRegister(): string | null {
    const p = password.value;
    if (!username.value.trim() || !p) return 'Choose a username and password.';
    if (!normalizeEmail(email.value) || !isValidEmailFormat(email.value)) {
      return 'Enter a valid email address.';
    }
    if (p.length < MIN_ACCOUNT_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_ACCOUNT_PASSWORD_LENGTH} characters.`;
    }
    return null;
  }

  async function submitRegister(): Promise<void> {
    if (isMock()) {
      setAuthError(mapError(new Error('ACCOUNTS_DISABLED_PREVIEW')));
      return;
    }
    const problem = validateRegister();
    if (problem) {
      setAuthError(problem);
      return;
    }
    const u = username.value.trim();
    const d = displayName.value.trim();
    const payload = {
      username: u,
      password: password.value,
      email: normalizeEmail(email.value),
      ...(d ? { displayName: d } : {}),
    };
    submitting.value = true;
    errorMessage.value = '';
    try {
      const session = authSession.backendUser?.isGuest
        ? await authUpgradeGuest(payload)
        : await authRegister(payload);
      authSession.setSession(session);
    } catch (e) {
      setAuthError(mapError(e));
    } finally {
      submitting.value = false;
    }
  }

  async function submitForgot(): Promise<void> {
    const em = normalizeEmail(forgotEmail.value);
    if (!em || !isValidEmailFormat(forgotEmail.value)) {
      setAuthError('Enter a valid email address.');
      return;
    }
    submitting.value = true;
    errorMessage.value = '';
    forgotMessage.value = '';
    try {
      const out = await authForgotPassword({ email: em });
      forgotMessage.value =
        out.message ||
        'If an account exists for that email, you will receive reset instructions.';
    } catch (e) {
      setAuthError(mapError(e));
    } finally {
      submitting.value = false;
    }
  }

  return {
    view,
    direction,
    submitting,
    errorMessage,
    username,
    password,
    email,
    displayName,
    forgotEmail,
    forgotMessage,
    mfaToken,
    mfaFactor,
    mfaTotpCode,
    mfaRecoveryCode,
    passkeyAvailable,
    passwordStrength,
    strengthBarClass,
    push,
    pop,
    readReturnedOauthError,
    armConditionalPasskey,
    stopConditionalPasskey,
    signInWithPasskey,
    startDiscord,
    startGoogle,
    submitLogin,
    submitMfa,
    submitRegister,
    submitForgot,
  };
}
