# Channel icon picker — sort order

Icons in **Create channel → icon** are ordered for **chat vs voice** relevance first, **A–Z by label** second.

**Implementation:** [`frontend/src/utils/iconChannelSort.ts`](../../frontend/src/utils/iconChannelSort.ts) — keyword substring match on filename. **Verified:** 2026-03-27.
