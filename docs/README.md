# Echo documentation

Public docs for contributors, self-hosters, and operators. Deep internal notes
(plans, reviews, audits) live locally in gitignored **`docs-dev/`** when that
tree is present on a developer machine.

**New here?** Start with **[DEVELOPMENT.md](DEVELOPMENT.md)**.

## Getting started

| Doc                                                      | Purpose                                           |
| -------------------------------------------------------- | ------------------------------------------------- |
| [DEVELOPMENT.md](DEVELOPMENT.md)                         | Clone → Bun install → `db:up` → `dev` → PR checks |
| [overview/repo-layout.md](overview/repo-layout.md)       | Monorepo map (clients vs server kits)             |
| [overview/STACK.md](overview/STACK.md)                   | Technologies and scale stance                     |
| [overview/agents.md](overview/agents.md)                 | Contributor / agent charter                       |
| [overview/code-placement.md](overview/code-placement.md) | Frontend file placement (CI-enforced)             |

## Product & contracts

| Doc                                                            | Purpose                          |
| -------------------------------------------------------------- | -------------------------------- |
| [contracts/](contracts/)                                       | REST / realtime / data contracts |
| [adr/](adr/)                                                   | Architecture decision records    |
| [overview/domain-map.md](overview/domain-map.md)               | Domain boundaries                |
| [overview/privacy-levels.md](overview/privacy-levels.md)       | Privacy positioning              |
| [overview/i18n.md](overview/i18n.md)                           | Localization stance              |
| [security/e2ee-threat-model.md](security/e2ee-threat-model.md) | E2EE threat model                |
| [specs/](specs/)                                               | Spec stubs / pointers            |

## Engineering guardrails

| Doc                                                                      | Purpose                             |
| ------------------------------------------------------------------------ | ----------------------------------- |
| [echo-code-charter.md](echo-code-charter.md)                             | New-code size / purity ratchet (CI) |
| [echo-voice-activity-conventions.md](echo-voice-activity-conventions.md) | VC activity naming conventions (CI) |

## Self-host & operations

| Doc                                                                                        | Purpose                                         |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| [operations/linux-vps-deployment.md](operations/linux-vps-deployment.md)                   | VPS / bare-metal deploy                         |
| [operations/livekit-production.md](operations/livekit-production.md)                       | LiveKit production                              |
| [infra/livekit-turn.md](infra/livekit-turn.md)                                             | TURN / ICE                                      |
| [infra/realtime-scaling.md](infra/realtime-scaling.md)                                     | Single-node vs NATS multi-instance              |
| [operations/media-cdn.md](operations/media-cdn.md)                                         | Media CDN sidecar                               |
| [operations/chat-video-hls.md](operations/chat-video-hls.md)                               | Chat video HLS worker                           |
| [operations/voice-e2ee-livekit.md](operations/voice-e2ee-livekit.md)                       | Voice E2EE                                      |
| [operations/instance-policy.md](operations/instance-policy.md)                             | Instance policy file                            |
| [operations/PRODUCTION_SECURITY_CHECKLIST.md](operations/PRODUCTION_SECURITY_CHECKLIST.md) | Production security                             |
| [operations/shipping-gate.md](operations/shipping-gate.md)                                 | Ship / prod gates                               |
| [operations/ios-passkeys.md](operations/ios-passkeys.md)                                   | iOS passkeys / Universal Links                  |
| [operations/runbooks/](operations/runbooks/)                                               | Backup, Postgres, Socket.IO, incidents          |
| [operations/versioning.md](operations/versioning.md)                                       | Product VERSION (major/minor/patch) + push gate |
| [operations/github-release-mirror.md](operations/github-release-mirror.md)                 | GitLab `release/1.0.0` → GitHub `main` mirror   |

## Chat formatting (user-facing)

Settings → Formatting copy: **[`marketing/terms/`](../marketing/terms/)**.
