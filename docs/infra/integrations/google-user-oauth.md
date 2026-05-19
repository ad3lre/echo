# Google user OAuth

Echo supports both linking an existing account to Google and signing up/in via Google OAuth.

## Environment

Set these in the root `.env` to enable Google OAuth:

| Variable                            | Notes                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GOOGLE_OAUTH_CLIENT_ID`            | OAuth 2.0 Client ID from Google Cloud Console.                                                             |
| `GOOGLE_OAUTH_CLIENT_SECRET`        | **Server-only.** Never expose to SPA.                                                                      |
| `GOOGLE_OAUTH_REDIRECT_URI`         | Exact callback URI registered in Google Console. E.g., `http://localhost:8080/api/v1/auth/google/callback` |
| `GOOGLE_OAUTH_SCOPES`               | Space-separated scopes. Defaults to `openid email profile`.                                                |
| `ECHO_DISCORD_TOKEN_ENCRYPTION_KEY` | Shared federated token key used to encrypt Google refresh and access tokens in the database.               |
| `ECHO_APP_PUBLIC_URL`               | SPA origin used after OAuth to redirect with query flags.                                                  |

## Flow mechanics

1. **Sign in / Sign up**: `POST /api/v1/auth/google/login/start` returns an authorization URL. Echo drops a signed cookie.
2. **Link**: `POST /api/v1/auth/google/start` (requires an active Echo session).
3. **Callback**: `GET /api/v1/auth/google/callback`.
   - On the `login` flow: Echo checks `auth_google_user_links`. If a record exists, Echo logs the user in.
   - If no record exists, Echo provisions a new user in `auth_users` with a `NULL` password hash, automatically generating a username from the Google email/profile.
   - Echo then creates the `auth_google_user_links` record and establishes the Echo session.

## Notes on provisioning

- **Email collisions**: If Google provides an email that already exists on a different Echo account (and that account is not linked to this Google ID), Echo will refuse to log in/sign up and will redirect with an `oauth_email_conflict` error. The user must log in manually and link Google via Settings.
- **MFA**: If the linked Echo account has two-factor authentication (TOTP) enabled, Echo will redirect with `google_login_mfa` because OAuth does not bypass TOTP. The user must sign in using their username/password and TOTP code.
- **Null passwords**: Users created via Google OAuth have no password. Attempting to sign in with a password will fail gracefully.
