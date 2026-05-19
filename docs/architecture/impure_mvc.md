# Analysis of Controller MVC Purity

Based on the rules defined in [`agents.md`](../overview/agents.md) (specifically the Controller **NO RULE**: "Controllers must NOT define business rules, decide data meaning, merge sources of truth, resolve conflicts, reconstruct canonical state, duplicate domain logic"), **the claim of 100% MVC purity is demonstrably false.**

We conducted an audit picking 13 orchestrators/controllers collectively and found widespread business logic, data shaping, canonical truth calculation, and policy decisions improperly housed in the orchestration layer.

Here is the breakdown of the exact violations found:

## 1. `serverSettingsRolesPersistenceController.ts`

**Violation:** Massive data shaping, partial state construction, and explicit object-diffing logic.
Instead of passing "Save Intents" down to a Model/Domain service that decides what changed, the controller manually diffs object arrays to construct its own payload patch logic manually evaluating properties (`permsChanged`, `nameChanged`).

## 2. `messageSearchController.ts`

**Violation:** Array mutation, fallback logic, and canonical state management.
It decides when pagination exhaustion has occurred by comparing API array lengths to constant limits inline (`if (rows.length < API_BATCH_LIMIT) { patch.apiExhausted = true; }`).

## 3. `voiceEngineController.ts`

**Violation:** Raw data transformation and metric calculations inline.
It manually defines how `bitrateKbps` and `packetLossPct` are calculated using math operations based on timestamps and byte differentials.

## 4. `workspaceEchoHydrateFromApi.ts`

**Violation:** Fallback resolution & navigation logic rules nested in hydration.
When establishing the first guild experience, it manually peeks into `state.categoriesByServer[preferredId]`, maps arrays, checks for text channels, and decides the `activeChannelId` inline rather than deferring the resolution logic to the Store/Model.

## 5. `echoWorkspaceLifecycleOrchestration.ts`

**Violation:** Fallback object building and merging sources of truth.
When hydration fails or resets, instead of invoking `Store.resetToGuest()`, the orchestrator manually constructs `applyWorkspaceRosterUsersPipeline([echoUserRowFromAuthUser(user)], {})` and hardcodes error display strings. This reconstructs domain truth sequentially within an orchestrator.

## 6. `appEchoRealtimeSocketBinding.ts`

**Violation:** UI Debounce / Priority Rules in the socket composition map.
It houses an ephemeral `lastDisconnectUiAt` local variable and defines the logical debounce rules for whether to show a UI toast error directly inside an `onUnexpectedDisconnect` webhook, instead of reacting to a Domain/Store network event threshold.

## 7. `workspaceSocialHydrate.ts`

**Violation:** Data schema mapping and conflict merging.
This orchestrator contains massive aggregation functions (`workspaceSocialFromRefreshResults`) that loops over network DTOs, shapes data (like mapping friend IDs and requests), and builds the local subset representation manually.

## 8. `useAddServerDiscordImportFlow.ts`

**Violation:** Inline string filtering and timeout thresholds.
It defines `filteredImportableGuilds` by manually performing `.toLowerCase().includes(q)` inline. More concerning, it holds hardcoded timeout thresholds, `botWaitDeadline` timestamp calculations, and applies strict pacing rules (`botWaitPollCount % 2 === 1`) natively instead of placing polling logic inside a discrete service.

## 9. `useAppLayoutShellNavigation.ts`

**Violation:** Deriving domain truth inline.
It exports an `isServerEmptyOnboarding` flag calculated by checking if `serverStore.servers.length === 0` and subsequently looping over `cats.every((c) => c.channels.length === 0)`. The controller is defining what "Empty Server Onboarding" structurally means rather than querying a View Model or State Model.

## 10. `useGuildChannelModals.ts`

**Violation:** Formatter transformations.
When saving categories, it manually transforms schemas: `const echoPartial = channelOverridesToEchoPartial(...)` and evaluates `Object.keys()` rules to format domain patches instead of telling a model "set these defaults".

## 11. `workspaceServerDeletionNav.ts`

**Violation:** Logical policy definitions.
It contains functions like `shouldRetargetServerAfterServerDeletion` that codify exactly how a missing server renders an ID array invalid `(!remainingServerIds.includes(cur))`. This is a pure policy decision living directly in the orchestration file.

---

### Conclusion

Across the tested controllers, we consistently observe "fat" managers. They do not just route UI intents; they define what data represents, construct structured data formats/DTOS, manage timer lifecycles natively, and calculate boundaries inline. This is a severe violation of the required Thin Controller/Rich Model standard.
