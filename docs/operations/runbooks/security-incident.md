# Security Incident Runbook (Echo)

This runbook covers first-response actions for common security incidents in a deployed Echo environment.

## First Response Checklist

1. Identify the incident category (credential leak, account takeover, data exposure, active exploitation).
2. Contain the blast radius (disable affected integrations, block abusive IPs at edge, rotate keys, revoke sessions).
3. Preserve evidence (request logs, audit logs, DB snapshots where appropriate).
4. Communicate internally (who is lead, who is on-call for infra, who owns user comms).

## Credential Leak (JWT secret, OAuth secrets, webhook secrets)

### Containment

- Rotate the leaked secret immediately.
- If `JWT_SECRET` is suspected, assume all signed artifacts derived from it are suspect:
  - rotate `JWT_SECRET`
  - rotate refresh token signing / encryption keys if separate keys exist in deployment
- Disable or rotate inbound webhook secrets (Discord bot secret, LiveKit webhook secret) and confirm old secrets are rejected.

### Recovery

- Force logout and session invalidation:
  - revoke refresh tokens for affected users or for all users if the leak is systemic
  - clear server sessions where possible
- Validate production startup gates still hold after rotation (CORS origin, metrics token, webhook secrets, media URL policy): [PRODUCTION_SECURITY_CHECKLIST.md](../PRODUCTION_SECURITY_CHECKLIST.md)

## Account Takeover (ATO)

### Identify scope

- Determine impacted user ids and the time window.
- Correlate with login audit data (IP/UA digests, timestamps).

### Containment

- Revoke refresh tokens for impacted users and invalidate active server sessions.
- If attack is ongoing, block abusive IP ranges at the reverse proxy/WAF.
- If OAuth-based login is involved, temporarily disable the provider or tighten callback validation.

### Recovery

- Require password reset for impacted accounts and re-issue MFA secrets if needed.
- Review privileged actions in audit logs (role changes, message deletions, admin-only endpoints).

## Suspected Data Exfiltration

### Containment

- Rate-limit or block suspicious endpoints at the edge.
- Disable high-risk outbound or integration features if they are part of the suspected path (unfurl, webhooks, importers).

### Evidence preservation

- Export relevant request logs (reverse proxy + app logs).
- Export application audit logs for the suspected time window.
- Snapshot relevant database tables if needed for later forensics.

### Triage questions

- Was the data reachable through a single endpoint (IDOR / authz gap) or via a systemic boundary failure?
- Did the attacker exploit cached/stale permissions (realtime vs REST desync) or a direct authorization bypass?

## Active Exploitation of a Known Class (Realtime room join / SSRF / OAuth CSRF)

- Confirm the current deployed version includes the patch records: [patched-security-issues.md](../../reviews/security/patched-security-issues.md)
- If uncertain, disable the feature at the edge:
  - block `/socket.io` temporarily (realtime)
  - block unfurl endpoints or outbound HTTP egress (SSRF)
  - disable OAuth provider login (OAuth CSRF)

## Post-Incident

- Write a short postmortem:
  - root cause and trust boundary violated
  - detection gaps
  - preventative controls (tests, config gates, documentation updates)
- Add a regression entry to [patched-security-issues.md](../../reviews/security/patched-security-issues.md) for confirmed issues.
