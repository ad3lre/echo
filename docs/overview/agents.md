[agents.md](http://agents.md)

When working in linux use tmux/GNU windows instead of main terminal space

Core Rule: No Guessing

THIS IS YOUR ABSOLUTE #1 rule, if you have anything you dont know that would affect your solution, stop add logging, or ask questions, then act, never act on guesses, act on knowledge.

Never guess. Ever.

Start with internal logs
If logs are insufficient:
Add aggressive logging
Ask user to reproduce and report back
Logs → understanding → then code
Assume docs are unreliable until verified against reality
Debugging Discipline
Code is not for debugging → logs are
Do not change behavior until the cause is known
If you don’t know what’s happening, stop and instrument
No Patching
Do not apply surface-level fixes
If the issue is systemic:
Stop
Report
Expand scope
Scope Control
Track time and scope constantly
If investigation expands too far:
Stop
Report to user
No Ignoring Issues
Do not ignore problems
Fix root causes, not symptoms
Includes:
“small” issues
type errors
structural inconsistencies
Work Style
Be todo-list driven
Report when scope expands
Remove debug logs after completion
Do not add tests unless:
explicitly requested, or
they directly help development/debugging
Client Charter (Hard Boundary)
Client SHOULD:
render state
handle user input
emit intents
apply layout / visual logic
Client MUST NOT:
decide what data means
merge sources of truth
apply fallback logic
define priority rules
coordinate across features
decide cache validity (usually)
implement business rules
Domain Authority Rule

Each domain must have:

exactly one authority for truth and rules

No duplication. No ambiguity.

Model Rules
YES Rule (Model owns):

If it decides what is true → model

Includes:

meaning
normalization
identity
merge / conflict rules
ordering
invariants
business rules
NO Rule (Model must NOT own):

If it decides how things look, flow, or feel → NOT model

Includes:

UI state
rendering
layout
interaction handling
animation / formatting
navigation flow
view-specific grouping/filtering
Operational Rules
Never manually modify tree.md → always regenerate
Run lint/tests in background when possible to save time
Meta Rule

When in doubt:

Move truth down (into model/domain)
Keep client thin
Prefer clarity over speed
Stop when you don’t understand what's happening

Controller Rules
✅ YES RULE (Controller owns)

If it routes intent and coordinates execution, it belongs in the controller.

Controllers should:

receive intents (user actions, events)
call model/domain services
orchestrate execution order (not logic)
handle lifecycle timing (init, teardown, subscriptions)
pass results to the view layer
wire modules together

Think:

controller = traffic manager, not decision maker

❌ NO RULE (Controller must NOT own)

If it decides what is true or how it looks, it must NOT be in the controller.

Controllers must NOT:

define business rules
decide data meaning
merge sources of truth
resolve conflicts
define ordering rules
implement fallback/priority logic
reconstruct canonical state
duplicate domain logic
contain UI/rendering logic
manage detailed UI state
Even more blunt
Execution flow → controller
Truth → model
Display → view
