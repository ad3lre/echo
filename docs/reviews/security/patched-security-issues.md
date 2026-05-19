# Patched Security Issues

This file tracks concrete security issues patched in the repo so we can avoid regressions and keep a lightweight audit trail.

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
