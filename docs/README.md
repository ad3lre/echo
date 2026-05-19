# Echo documentation

Start here, then open the area that matches your work. **New to the repo?** See **[DEVELOPMENT.md](DEVELOPMENT.md)** (clone → install → dev server → PR checks).

## Overview

- [Stack](overview/STACK.md) — technologies and scale stance
- [Repository tree](overview/tree.md) — layout snapshot (regenerate: `node scripts/generate-tree-md.mjs` from repo root)
- [agents.md](overview/agents.md) — client/controller charter for contributors
- [privacy-levels.md](overview/privacy-levels.md) — product privacy positioning
- [frontend-typescript-bloat-audit.md](overview/frontend-typescript-bloat-audit.md) — multi-axis TS/Vue size and coupling audit (repro commands inside)

## Architecture (client charter)

- [client-charter-violations.md](architecture/client-charter-violations.md) — strict-charter tensions (merge, session, messaging) in compact tables
- [client-layer-violations.md](architecture/client-layer-violations.md) — hotspot map and file pointers
- [client-charter-leak-goals.md](architecture/client-charter-leak-goals.md) — leak-goals checklist
- Per-area notes: `docs/architecture/clientCharter*.md` (see [architecture/README.md](architecture/README.md))

## Reviews & status

- [STATUS_AND_PRODUCTION_READINESS.md](reviews/STATUS_AND_PRODUCTION_READINESS.md) — product/engineering scorecard and doc map
- [reviews/security/](reviews/security/) — threat model and patch log for operators

## Infra

Subsystem reference: [infra/](infra/).

## Plans

Forward-looking technical plans: [plans/](plans/).

## Operations

Runbooks and procedures: [operations/](operations/).

**Native apps:** repo root [`releases/`](../releases/README.md); deeper procedures under `operations/`.

## Contracts and specs

- [contracts/](contracts/) — API/data contracts
- [specs/](specs/) — technical specs

## ADRs

[adr/](adr/) — architecture decision records.

## Chat formatting (Markdown and math)

User-facing copy for **Settings → Formatting** lives in **[`terms/`](../terms/)**.
