# Instance policy file

Self-hosters can tune **operational** knobs—registration, guest accounts, socket
limits, HTTP rate buckets, upstream quotas, and advertised voice region labels—in
one validated JSON file instead of dozens of `ECHO_*` environment variables.

Secrets and connectivity stay in env (`.env`): `JWT_SECRET`, `DATABASE_URL`,
`REDIS_URL`, OAuth client secrets, API keys, `PORT`, `HOST`, `CORS_ORIGIN`, etc.

Plan tier caps (`contracts/echoPlanLimits.ts`) are **not** overridden by this file.

## Quick start

1. Copy [`echo.instance.example.json`](../../echo.instance.example.json) to
   `echo.instance.json` at the repo root (or set `ECHO_INSTANCE_POLICY_PATH`).
   The live file is **gitignored** — only the example is tracked.
2. Edit policy fields you care about.
3. Validate without starting the API:

   ```bash
   npm run instance-policy:validate
   # or a custom path:
   node server/ops/scripts/validate-instance-policy.mjs /path/to/echo.instance.json
   ```

4. Start Echo as usual (`npm run dev`, `npm run prod`, …).

If the file is missing, Echo uses built-in defaults (same behavior as before this
feature).

## Precedence

**Environment variables override the JSON file** when both set the same knob.

Example: `guest.enabled: true` in JSON plus `ECHO_GUEST_ACCOUNTS_ENABLED=0` in
`.env` → guests stay **off**.

See [Env override map](#env-override-map) below.

## Hot reload (optional)

Set `ECHO_INSTANCE_POLICY_WATCH=1` to re-read the policy file on change
(debounced 300ms). Invalid JSON keeps the last good snapshot and logs an error.

Hot reload is **per process**. Multi-node deployments should restart all API
processes or leave watch disabled in production.

Fields that require restart (not hot-swapped): `PORT`, storage mode, JWT, DB/Redis
URLs, CORS, snowflake IDs, secrets.

## Public API (SPA)

`GET /api/v1/system/instance-policy` returns a client-safe subset:

- `general.instanceName`, `general.publicUrls`
- `registration.disabled`
- `guest.enabled`, guest caps, Turnstile site key
- `regions.voice`

The SPA loads this at boot (`useInstancePolicyStore`) so guest UI can follow
runtime policy without rebuilding with `VITE_ECHO_GUEST_ACCOUNTS_ENABLED`.

Build-time `VITE_ECHO_GUEST_ACCOUNTS_ENABLED=1` still forces guest UI on (useful
for split CDN/API builds).

## Schema sections

| Section           | Purpose                                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| `general`         | Instance name/description; default public URLs (overridden by `ECHO_*_PUBLIC_URL`)   |
| `registration`    | Disable registration, email verification, username/password bounds, HWID account cap |
| `guest`           | Guest mint, directory pool, Turnstile site key (secret stays in env)                 |
| `limits.socket`   | Socket message burst + per-minute caps, idempotency window                           |
| `limits.http`     | Global REST, Echo API scope, per-route buckets, optional instance-wide absolute caps |
| `limits.upstream` | Serper, Honcho, Discord import daily caps                                            |
| `regions.voice`   | Advertised voice region labels (LiveKit routing is configured separately)            |

Typed defaults live in [`contracts/instancePolicy.ts`](../../contracts/instancePolicy.ts).
JSON Schema: [`contracts/instancePolicySchema.json`](../../contracts/instancePolicySchema.json).

## Env override map

| Environment variable                       | Policy path                                                    |
| ------------------------------------------ | -------------------------------------------------------------- |
| `ECHO_APP_PUBLIC_URL`                      | `general.publicUrls.app`                                       |
| `ECHO_API_PUBLIC_URL`                      | `general.publicUrls.api`                                       |
| `ECHO_MARKETING_PUBLIC_URL`                | `general.publicUrls.marketing`                                 |
| `ECHO_REGISTRATION_DISABLED`               | `registration.disabled`                                        |
| `ECHO_REQUIRE_EMAIL_VERIFICATION`          | `registration.requireEmailVerification`                        |
| `ECHO_AUTH_HWID_ACCOUNT_CAP`               | `registration.hwidCap.enabled`                                 |
| `ECHO_AUTH_HWID_MAX_ACCOUNTS_PER_KEY_IP`   | `registration.hwidCap.maxAccountsPerKeyIp`                     |
| `ECHO_GUEST_ACCOUNTS_ENABLED`              | `guest.enabled`                                                |
| `ECHO_GUEST_MAX_TOTAL_MESSAGES`            | `guest.maxTotalMessages`                                       |
| `ECHO_GUEST_DIRECTORY_POOL_SIZE`           | `guest.directory.poolSize`                                     |
| `ECHO_GUEST_SERVER_SAMPLE_COUNT`           | `guest.serverSampleCount`                                      |
| `ECHO_GUEST_MINT_MAX_PER_IP_HOUR`          | `guest.mint.maxPerIpPerHour`                                   |
| `ECHO_GUEST_MINT_CAPTCHA_AFTER_N`          | `guest.mint.captchaAfterN`                                     |
| `ECHO_GUEST_CAPTCHA_FAIL_BLOCK_THRESHOLD`  | `guest.captcha.failBlockThreshold`                             |
| `ECHO_GUEST_CAPTCHA_FAIL_BLOCK_HOURS`      | `guest.captcha.failBlockHours`                                 |
| `ECHO_GUEST_ABUSE_COMBO_BLOCK_MINUTES`     | `guest.abuseComboBlockMinutes`                                 |
| `ECHO_TURNSTILE_SITE_KEY`                  | `guest.turnstile.siteKey`                                      |
| `ECHO_SOCKET_MSG_PER_MINUTE`               | `limits.socket.messagesPerMinute`                              |
| `ECHO_SOCKET_BURST_MAX`                    | `limits.socket.burst.max`                                      |
| `ECHO_SOCKET_BURST_WINDOW_MS`              | `limits.socket.burst.windowMs`                                 |
| `ECHO_SOCKET_MAX_EVENTS_PER_SEC`           | `limits.socket.maxEventsPerSecond`                             |
| `ECHO_MESSAGE_IDEMPOTENCY_MINUTES`         | `limits.socket.idempotencyMinutes`                             |
| `SERPER_RATE_LIMIT_PER_MINUTE`             | `limits.upstream.serper.perMinute`                             |
| `SERPER_UPSTREAM_MAX_PER_DAY_PER_IP`       | `limits.upstream.serper.maxPerDayPerIp`                        |
| `SERPER_GLOBAL_MAX_PER_DAY`                | `limits.upstream.serper.globalMaxPerDay`                       |
| `SERPER_GLOBAL_MAX_PER_MONTH`              | `limits.upstream.serper.globalMaxPerMonth`                     |
| `HONCHO_RATE_LIMIT_PER_MINUTE`             | `limits.upstream.honcho.perMinute`                             |
| `ECHO_DISCORD_IMPORT_MAX_PER_USER_PER_DAY` | `limits.upstream.discordImport.maxMetadataStartsPerUserPerDay` |
| `ECHO_MFA_LOGIN_MAX_PER_IP_PER_15MIN`      | `limits.http.routes.auth.mfaLogin.max`                         |

`ECHO_TURNSTILE_SECRET_KEY` remains env-only (never in JSON).

HTTP route buckets under `limits.http.routes.*` are edited in JSON; most routes
do not have a dedicated env alias yet.

## Absolute instance caps

`limits.http.absolute.register` and `limits.http.absolute.messages` provide
Spacebar-style instance-wide caps (in-memory per process when enabled). Useful
for registration spam alongside per-IP limits.

## Voice regions

`regions.voice.available` is metadata for clients (channel settings hint, future
voice UI). LiveKit SFU URLs remain in [`server/ops/infra/livekit/livekit.yaml`](../../server/ops/infra/livekit/livekit.yaml)
and `LIVEKIT_*` env vars.

## Related

- [`.env.example`](../../.env.example) — secrets and connectivity
- [`linux-vps-deployment.md`](./linux-vps-deployment.md) — production layout
