# Security policy

## Supported versions

Security fixes are applied to the **default branch** of this repository. There are no separate long-term support branches unless announced in release notes.

## Reporting a vulnerability

**Please use [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)** for this repository when it is enabled (Repository → **Security** → **Report a vulnerability**). That avoids disclosing exploit details in public issues.

If private reporting is unavailable, open a **draft** security advisory with minimal reproduction details, or contact the maintainers through the contact options on the GitHub organization or repository profile. **Do not** paste live credentials, session tokens, or production URLs with secrets into public issues or comments.

### What we want to hear about

- Authentication or authorization bypasses (including IDOR affecting other users’ data).
- Remote code execution, SQL injection, or unsafe deserialization on supported paths.
- Cryptographic mistakes that break confidentiality or integrity of user data in realistic deployments.

### Out of scope (unless you show meaningful impact)

- Denial of service without a minimal, reproducible scenario and measured impact.
- Issues that require a victim to install a malicious browser extension or compromise their machine.
- Theoretical problems without a plausible attack path against a default or documented configuration.

### What to include

- Affected component (e.g. `server/backend/`, `clients/web/`, `clients/apple/`) and version or commit SHA.
- Steps to reproduce, expected vs actual behavior, and impact assessment.
- Optional: suggested fix (pull requests welcome after coordination).

### Response expectations

Maintainers will acknowledge valid reports **as capacity allows**; there is no SLA. We may ask follow-up questions before assigning severity or scheduling a fix.

## Public repository and history

This **public** GitHub repository is published **without prior private development history**, so there is no legacy commit graph to recover old blobs from **this** host. You should still avoid committing secrets, and you should **rotate** any credential that was ever exposed outside this repository (for example in a previous private remote or chat).

## Safe harbor

If you make a good-faith effort to follow this policy, we will not pursue civil action or ask law enforcement to investigate you. We cannot bind third parties; respect their systems and rate limits.
