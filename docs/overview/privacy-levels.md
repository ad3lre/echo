# Privacy Levels — Echo

**Last updated:** 23 March 2026  
**Effective date:** 23 March 2026

This document describes **privacy levels** for Echo communities and deployments. Levels describe how much data is collected, how identity persists, and how deeply the system may analyze behavior or content. Actual capabilities depend on product configuration, host setup (for self-hosted instances), and applicable law.

For how Echo processes personal data in general, see [Privacy Policy](./privacy.md).

---

## Overview

| Level  | Name            | Summary                                                    |
| ------ | --------------- | ---------------------------------------------------------- |
| **−1** | Off Grid        | Self-hosted; host controls all data and logging.           |
| **0**  | Anonymous       | Ephemeral identity; minimal retention; restricted capture. |
| **1**  | Private         | Standard messaging; no analytics or behavioral tracking.   |
| **2**  | Analytics       | Aggregate / anonymous community stats only.                |
| **3**  | Behavioral      | Per-user interaction patterns; not deep content meaning.   |
| **4**  | Personalization | Adaptive UX; light AI classification; recommendations.     |
| **5**  | Scientific      | Deep content and behavior modeling; advanced automation.   |

Higher levels imply more processing power and more privacy impact. Communities or hosts should choose the **lowest level** that still meets their operational needs.

---

## Level −1 — Off Grid

**Self-hosted community**

- Full control by the host environment.
- Data is fully managed by the server owner.
- No platform-enforced data rules (beyond what the host implements).
- Privacy and logging depend entirely on host setup.
- Can be highly private or minimally private depending on configuration.

**Takeaway:** _“It depends on who runs it.”_ This mode is defined by the host, not by Echo’s default cloud policies.

---

## Level 0 — Anonymous

**Ephemeral identity community**

- Conversations exist without lasting identity.
- Accounts are anonymized.
- Search is disabled.
- Message history is regularly deleted.
- Copying and recording features are restricted.
- No long-term logs or stored user identity (as implemented for this level).

**Takeaway:** Designed for **temporary, low-persistence** interaction—not for durable archives or strong accountability tied to identity.

---

## Level 1 — Private

**Standard communication**

- Persistent accounts.
- Messages stored in the usual way for the product.
- Basic moderation and error logs.
- No analytics or behavioral tracking at the platform level for this community.

**Takeaway:** **Stable, traditional messaging** with minimal extra data collection beyond what’s needed to run chat and keep the service safe.

---

## Level 2 — Analytics

**Community understanding**

- Anonymous (or strongly aggregated) usage statistics.
- Activity and engagement trends at the **community** level.
- Performance and reliability metrics.
- No individual-level tracking (as defined for this level).

**Takeaway:** Focus on the **group**, not the person.

---

## Level 3 — Behavioral

**Interaction patterns**

- Per-user interaction patterns (e.g. frequency, session continuity).
- Engagement frequency and behavior signals.
- Cross-session activity continuity where enabled.
- No deep content interpretation yet (meaning is not the primary signal).

**Takeaway:** Focus on **actions and usage**, not on semantic understanding of message text.

---

## Level 4 — Personalization

**Adaptive experience**

- Preference learning.
- Content and feature recommendations.
- AI-assisted content classification at a **light** level.
- Experience adapts per user.

**Takeaway:** Focus on **relevance** and tailored UX, with proportionate processing.

---

## Level 5 — Scientific

**Advanced AI understanding**

- Full content understanding (topics, tone, intent) where enabled.
- Advanced behavioral modeling.
- Personalization based on learned patterns.
- Predictive interaction systems.
- Cross-community pattern analysis **only if** enabled by system design and policy.

**Takeaway:** Highest capability—and highest sensitivity. Intended for **deep modeling** to improve experience, moderation, and automation, subject to governance, consent where required, and host/product settings.

---

## Notes

- **Self-hosted (−1)** and **cloud-hosted** Echo may not offer every level; availability is a product and configuration decision.
- Legal requirements (e.g. GDPR, especially for minors) apply **regardless** of level labels—this document describes intent and design tiers, not a substitute for legal analysis or your [Privacy Policy](./privacy.md).
