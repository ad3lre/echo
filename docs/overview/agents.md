# Contributor and agent charter

**Audience:** Human contributors and automated agents working in this repository.  
**Related:** [AGENTS.md](../../AGENTS.md) (repo-root pointer), [client-charter-violations.md](../architecture/client-charter-violations.md) (inventory).

This document defines how we investigate problems, control scope, and separate **domain truth** from **orchestration** and **presentation**. When behavior is unclear, prefer evidence (logs, code, reproduction) over assumptions.

---

## Environment

On Linux, prefer **tmux** or **GNU screen** for long-running sessions instead of tying work to a single ephemeral terminal.

---

## Investigation and debugging

### No guessing

Do not implement or “fix” behavior based on assumptions. If missing information would change the solution:

1. Stop.
2. Gather evidence (logs, traces, reproduction) or ask a targeted question.
3. Act only once the cause or requirement is understood.

Treat documentation as **hints** until verified against the running system.

### Debugging workflow

| Step | Action                                                                                    |
| ---- | ----------------------------------------------------------------------------------------- |
| 1    | Start with existing internal logs and metrics.                                            |
| 2    | If insufficient, add targeted instrumentation (temporary, aggressive if needed).          |
| 3    | Ask the user to reproduce and report results when you cannot observe the failure locally. |
| 4    | Change code only after logs support a concrete hypothesis.                                |

**Principles:**

- Use logs for diagnosis; avoid using production code paths as the primary debug surface.
- Do not change behavior until the root cause is identified.
- If the current state is unknown, instrument before editing.

### No patching

Avoid surface-level fixes that mask systemic issues. When the problem is architectural or cross-cutting:

1. Stop incremental patching.
2. Report findings and proposed scope to the user.
3. Expand the fix deliberately rather than accumulating local workarounds.

### Scope and quality

- Track time and scope; report when investigation or implementation grows beyond the original ask.
- Do not ignore “small” issues (type errors, structural inconsistencies, latent bugs). Fix root causes, not symptoms.
- Work in a task-oriented way; remove temporary debug logging when work is complete.
- Add automated tests only when explicitly requested, or when they materially support development or debugging of the change at hand.

---

## Layer responsibilities

Echo’s frontend architecture follows a strict split:

| Layer              | Owns                                                                                                                      | Must not own                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Model / domain** | What is true: meaning, normalization, identity, merge/conflict rules, ordering, invariants, business rules                | UI state, layout, interaction, navigation flow, view-specific filtering                                           |
| **Controller**     | Routing intent, orchestration order, lifecycle (init/teardown/subscriptions), wiring modules, passing results to the view | Business rules, merging sources of truth, conflict resolution, canonical state reconstruction, rendering          |
| **View / client**  | Rendering state, user input, intents, layout and visual presentation                                                      | What data means, cross-feature coordination, fallback/priority policy, cache validity (typically), business rules |

**Mnemonic:** execution flow → controller; truth → model; display → view.

### Domain authority

Each domain has **exactly one** authority for truth and rules. No duplicated semantics, no ambiguous ownership.

### Client (view) charter

**Should:**

- Render state.
- Handle user input and emit intents.
- Apply layout and visual logic.

**Must not:**

- Decide what data means.
- Merge sources of truth or apply fallback logic.
- Define priority rules or coordinate policy across features.
- Decide cache validity (in most cases).
- Implement business rules.

### Model charter

**Belongs in the model when** it decides what is true, including:

- Meaning and normalization.
- Identity.
- Merge and conflict rules.
- Ordering and invariants.
- Business rules.

**Does not belong in the model when** it decides how things look, flow, or feel, including:

- UI state, rendering, layout.
- Interaction handling, animation, formatting.
- Navigation flow.
- View-specific grouping or filtering.

### Controller charter

**Belongs in the controller when** it routes intent and coordinates execution:

- Receive intents (user actions, events).
- Call model/domain services.
- Orchestrate execution order (without embedding business logic).
- Manage lifecycle timing and subscriptions.
- Pass results to the view and wire modules together.

Think of the controller as a **traffic manager**, not a decision maker.

**Does not belong in the controller:**

- Business rules or data meaning.
- Merging sources of truth, conflict resolution, or ordering policy.
- Fallback/priority logic or canonical state reconstruction.
- Duplicated domain logic.
- UI/rendering logic or detailed UI state.

---

## Operational conventions

| Rule           | Detail                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tree.md`      | Do not edit manually; regenerate via the project script.                                                                                                                                                |
| Lint and tests | Run in the background when practical to preserve interactive time.                                                                                                                                      |
| Client auth    | Session rotation, desktop CORS-simple transport, and socket recycle rules: [OPTION_A_SESSION_ARCHITECTURE.md](../infra/auth/OPTION_A_SESSION_ARCHITECTURE.md#client-auth-invariants-frontend-contract). |

---

## When uncertain

1. Move truth **down** into the model or domain layer.
2. Keep the client **thin**.
3. Prefer clarity over speed.
4. Stop and gather evidence rather than guessing.

---

## External reference

The [agents.md](https://agents.md) community convention inspired the repo-root [AGENTS.md](../../AGENTS.md) entry point. This file is the **Echo-specific** charter; it supersedes generic templates where they conflict.
