# Patched Security Issues

This file tracks concrete security issues patched in the repo so we can avoid regressions and keep a lightweight audit trail.

## 2026-05-31

### 1. Upload serve Content-Type XSS / MIME confusion (#82)

- Severity: High
- Area: Upload file delivery (`GET /uploads/files/*`, S3 read-through)
- Fixed in:
  - `backend/src/services/echoUploadContentTypePolicy.ts` (new)
  - `backend/src/services/echoUploadServe.ts`
  - `backend/src/api/routes/echo/echoUploads.ts`
- Root issue:
  - Served `Content-Type` could come from DB metadata without allowlist re-check.
  - `image/svg+xml` matched presign `image/*` rule.
  - Responses lacked `X-Content-Type-Options: nosniff`.
- Impact:
  - Poisoned metadata or SVG uploads could cause browsers to interpret user content as executable HTML/script when opened from the upload origin.
- Patch summary:
  - Central MIME policy blocks SVG, HTML, and JavaScript types at presign and serve time.
  - Serve path sets `nosniff` and `Content-Disposition: attachment` when type is coerced to `application/octet-stream`.
  - Regression tests in `backend/src/tests/echoUploadContentTypePolicy.test.ts`.

### 2. Bot install IDOR (#71)

- Severity: High
- Area: `POST /api/v1/echo/bot-applications/:botId/guilds/:guildId`
- Fixed in:
  - `backend/src/api/routes/echo/echoBotApplications.ts`
- Root issue:
  - Any user with `MANAGE_GUILD` could install any bot application by snowflake ID without being the bot owner.
- Impact:
  - Unauthorized third-party bot propagation into guilds when bot IDs are known or guessable.
- Patch summary:
  - Install route now requires `owner_user_id === authenticated user`.
  - Static regression check in `backend/src/tests/echoInviteSharePage.xss.test.ts`.

### 3. CSRF + XSS regression test suite

- Severity: Hardening (no new vuln)
- Area: CI / audit trail
- Fixed in:
  - `backend/src/tests/csrf.enforcement.test.ts`
  - `frontend/src/features/chat/viewModel/messageBodyMarkdown.xss.test.ts`
  - `backend/package.json` (`test:security`)
- Patch summary:
  - Negative CSRF tests for `PATCH /me` and `POST /guest/upgrade`.
  - Markdown XSS payload corpus for chat rendering pipeline.

### 4. Profile field HTML stripping (defense-in-depth)

- Severity: Low–Medium
- Area: Auth profile storage (`displayName`, `bio`, `customStatus`)
- Fixed in:
  - `backend/src/auth/accountPolicy.ts`
  - `backend/src/auth/store/memory/MemoryAuthStore.ts`
  - `backend/src/auth/store/postgres/PostgresAuthStore.ts`
- Patch summary:
  - Strip angle-bracket markup and control chars before persisting profile text fields.

### 5. Markdown / Paper / unfurl hardening

- Severity: Medium
- Fixed in:
  - `frontend/src/features/chat/viewModel/messageBodyMarkdown.ts` (`ALLOW_UNKNOWN_PROTOCOLS: false`)
  - `frontend/src/features/paper/editor/paperKatexRenderCache.ts` (DOMPurify on KaTeX HTML)
  - `frontend/src/components/chat/EmojiAutocompletePopover.vue` (`safeCustomEmojiUrl`)
  - `backend/src/services/linkUnfurl/linkUnfurlFetch.ts` (HTTPS-only unfurl)
  - `backend/src/services/integrations/turnstileVerify.ts` (`remoteip` binding)

### 6. Security backlog batch (Medium/Low ledger items)

- Severity: Medium / Low (see `docs/security/vulnerability-ranking.md` ledger)
- Area: Account step-up, bot tokens, rate limits, webhooks, config guards
- Fixed in (highlights):
  - `backend/src/auth/stepUpAuth.ts` — TOTP step-up for delete account, change password, transfer ownership (#85, #101, #102)
  - `backend/src/services/botTokenHash.ts` — bcrypt bot token storage with legacy SHA-256 verify (#29)
  - `backend/src/services/echoWebhookSignature.ts` — HMAC verification for Discord hooks in production (#93, #94)
  - `backend/src/bootstrap/createFastify.ts` — `randomUUID()` request IDs (#18)
  - `backend/src/sockets/eventMiddleware.ts` — sampled socket packet logging (#21)
  - `backend/src/api/routes/echo/echoPublic.ts`, `echoSocial.ts`, `discordApi/index.ts` — rate limits (#25, #28, #87)
  - `backend/src/config.ts` — postgres deployments require strong JWT + default socket auth (#7, #19)
  - `backend/src/services/localUploadTokenReplay.ts` — fail closed without Redis in production (#13)
- Regression tests: `botTokenHash.test.ts`, `echoWebhookSignature.test.ts` (in `npm run test:security`)

### 7. Large-ticket backlog (upload ACL, dedupe integrity, email verify, OAuth origins)

- Severity: Medium / Low
- Fixed in:
  - `backend/src/services/uploadReadToken.ts` — HMAC signed read tokens (`?read=`) + `POST /uploads/read-token` (#15, #81)
  - `backend/src/api/routes/echo/echoUploads.ts` — ACL on local + S3 read-through; conservative cache headers retained
  - `backend/src/services/csamScan/index.ts` — server-side SHA-256 verify for image **and video** dedupe register (#84)
  - `backend/src/auth/verifyEmailFlow.ts`, `backend/src/api/routes/auth/register.ts`, `frontend/src/views/VerifyEmailView.vue` — fragment + POST verify (#100)
  - `backend/src/config.ts` — `ECHO_APP_PUBLIC_URL` / `ECHO_API_PUBLIC_URL` must match `CORS_ORIGIN` on postgres/production deploys (#32)
- Regression tests: `uploadReadToken.test.ts`

### 8. Final backlog closure (ledger #23–103)

- Severity: Low / Medium (remaining ranked findings)
- Fixed / mitigated in (highlights):
  - `backend/src/auth/loginAudit.ts` — HMAC digests for IP/UA (#23)
  - `backend/src/api/sharedMutationRateLimits.ts` — shared Discord import, E2EE, emoji, bridge limits (#50, #67, #69, #75–76)
  - `backend/src/api/routes/discordApi/rest/userBatch.ts` — batch author load (#34)
  - `backend/src/api/routes/discordApi/rest/gateway.ts` — IP rate limit (#30)
  - `backend/src/api/routes/health.ts` — metrics auth + redacted health (#8, #17)
  - `backend/src/api/routes/livekitWebhook.ts` — redacted logs; count-only workspace events (#92)
  - `backend/src/api/routes/passkeyRoutes.ts` — user-scoped ceremony keys + credential bounds (#89, #90)
  - `backend/src/api/routes/echo/echoDiscordBridgeSettings.ts` — `bridgeConfigured` GET (#66)
  - `frontend/src/api/echo/discordBridge.ts` — compatible with `bridgeConfigured` response
- Ledger: all **103** findings marked closed in `docs/security/vulnerability-ranking.md` (Fixed / Mitigated / Accepted).

## 2026-04-23

### 1. AWS XML builder transitive CVE in S3 upload path (CVE-2026-41650)

- Severity: Moderate
- Area: Backend dependency chain for S3 XML serialization
- Fixed in:
  - `package.json`
  - `package-lock.json`
- Root issue:
  - `backend/package.json` pulls `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, which both transitively reach `@aws-sdk/xml-builder` and `fast-xml-parser`.
  - The vulnerable graph selected `fast-xml-parser@5.5.8`, which is affected by `CVE-2026-41650`.
- Impact:
  - XMLBuilder comment and CDATA injection could flow into any AWS SDK XML serialization path that builds XML from attacker-controlled content.
- Patch summary:
  - Added a root override so the lockfile resolves `fast-xml-parser@5.7.0`, the patched release that `@aws-sdk/xml-builder` now consumes.
  - Re-checked the lockfile and confirmed `CVE-2026-41650` no longer appears in the npm audit graph.

### 2. NATS broker image carried Go stdlib TLS resumption bypass (CVE-2025-68121)

- Severity: Critical
- Area: Dev/runtime infrastructure (`docker-compose.yml`)
- Fixed in:
  - `docker-compose.yml`
- Root issue:
  - The compose stack used `nats:2.10-alpine`.
  - Trivy reported `CVE-2025-68121` in `stdlib` on that image.
- Impact:
  - The repo's NATS service was pulling a container image with a known critical `stdlib` TLS issue.
- Patch summary:
  - Upgraded the compose image to pinned `nats:2.11.16-alpine@sha256:47169454fd238c3bd104f9947a6f84c1fb4713cd89ebf29da541ce53358fc298`.
  - Re-scan of the exact pinned image shows zero high/critical CVEs and `CVE-2025-68121` is no longer present.

### 3. NATS broker image carried musl qsort memory-corruption CVE (CVE-2026-40200)

- Severity: High
- Area: Dev/runtime infrastructure (`docker-compose.yml`)
- Fixed in:
  - `docker-compose.yml`
- Root issue:
  - The same `nats:2.10-alpine` image also reported `CVE-2026-40200` in `musl` and `musl-utils`.
- Impact:
  - The development broker image carried a known musl memory-corruption issue.
- Patch summary:
  - The pinned `2.11.16-alpine` replacement removes the vulnerable musl package revision from the scanned NATS service image.
  - Re-scan of the current pinned image shows zero high/critical CVEs.

### 4. TURN image carried OpenSSL remote DoS CVE (CVE-2025-15467)

- Severity: Critical
- Area: TURN relay container image
- Fixed in:
  - `docker-compose.yml`
- Root issue:
  - The compose stack used `coturn/coturn:4.6.2`.
  - Trivy reported `CVE-2025-15467` in `openssl` and `libssl3` on that image.
- Impact:
  - The repo's TURN service was pulling a container image with a critical OpenSSL issue in the Debian package set.
- Patch summary:
  - Upgraded and pinned the compose service to `coturn/coturn:4.10.0-r1-alpine@sha256:9b5db8e011848c903ebbeaa9b88e77f2dc4438db10e0891971e11ac354b84fce`.
  - The exact pinned replacement image scanned clean for high and critical findings.

### 5. TURN image carried libxml2 use-after-free CVE (CVE-2024-56171)

- Severity: Critical
- Area: TURN relay container image
- Fixed in:
  - `docker-compose.yml`
- Root issue:
  - The old `coturn/coturn:4.6.2` image also reported `CVE-2024-56171` in `libxml2`.
- Impact:
  - The TURN relay image carried a critical libxml2 memory-safety issue from the Debian-based build.
- Patch summary:
  - The pinned `4.10.0-r1-alpine` replacement removes the vulnerable Debian userland packages that produced the libxml2 finding.
  - Re-scan of the exact replacement image shows zero high/critical CVEs.

## 2026-04-22

### 1. Socket room join auth bypass

- Severity: P0
- Area: Socket.IO room authorization
- Fixed in:
  - `backend/src/sockets/channelHandlers.ts`
- Root issue:
  - `joinChannel` allowed arbitrary non-empty room names.
  - Auth checks only ran when the requested room matched a real Echo channel row.
  - That let clients join internal rooms like `echo:user:<id>` and `echo:server:<id>`.
- Impact:
  - Unauthorized subscription to user-scoped and server-scoped events such as `attention:update`, `read_state:update`, `dm:activity`, and `echo:workspace_event`.
- Patch summary:
  - In Echo/Postgres mode, `joinChannel` now rejects unknown room names and only allows real, authorized Echo channels.
  - Legacy non-Echo behavior remains unchanged.

### 2. Discord OAuth login CSRF / browser continuity bypass

- Severity: High
- Area: Discord OAuth callback validation
- Fixed in:
  - `backend/src/api/routes/discordOAuth.ts`
- Root issue:
  - The callback accepted a valid signed login `state` even without the matching OAuth cookie.
  - That weakened browser continuity for normal web login.
- Impact:
  - Login CSRF / account swapping risk in the Discord web login flow.
- Patch summary:
  - Normal web login now requires the matching login cookie.
  - Only desktop handoff is allowed to rely on signed `state` alone.

### 3. Link unfurl SSRF via DNS resolution

- Severity: High
- Area: Outbound unfurl / oEmbed fetch safety
- Fixed in:
  - `backend/src/services/linkUnfurl/linkUnfurlFetch.ts`
  - `backend/src/services/linkUnfurl/linkUnfurl.ts`
- Root issue:
  - The safety check blocked obvious private/local hostnames and IP literals, but did not verify what public-looking hostnames resolved to.
- Impact:
  - SSRF risk against loopback, RFC1918, link-local, or ULA targets through attacker-controlled DNS.
- Patch summary:
  - Added DNS resolution checks before outbound unfurl fetches.
  - Requests are now rejected when any resolved IP is private or local.
  - JSON unfurl fetches now follow redirects manually so every redirect hop is revalidated before any outbound request is made.

### 4. Guest account takeover via unsigned resume cookie

- Severity: High
- Area: Guest auth / account resume
- Fixed in:
  - `backend/src/auth/sessionCookies.ts`
  - `backend/src/api/routes/auth/guest.ts`
  - `backend/src/tests/auth.integration.ts`
- Root issue:
  - `echo_guest_uid` stored a raw guest user id and `/api/v1/auth/guest` trusted that id as sufficient proof to resume the account.
- Impact:
  - Anyone who knew a guest user id could forge `echo_guest_uid=<id>` and mint a full browser session for that guest account.
- Patch summary:
  - Guest binding cookies are now signed and expiration-checked server-side.
  - Invalid or forged guest binding cookies are cleared instead of being trusted.
  - Added a regression test proving a forged raw guest id cookie no longer resumes another guest account.
