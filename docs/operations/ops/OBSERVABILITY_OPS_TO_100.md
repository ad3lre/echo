# Observability & ops pillar: path toward 100%

**Audience:** Engineers and SREs using pillar **16 — Observability & ops** in [`STATUS_AND_PRODUCTION_READINESS.md`](../../reviews/STATUS_AND_PRODUCTION_READINESS.md) (scored **100%** for in-repo metrics, logs, rules-as-code, runbooks, and **optional** OpenTelemetry when configured — see §7).

**Scope:** How Echo is **measured, logged, and operated** in production — **Prometheus**, **structured logs**, **health/readiness**, **runbooks**, and **multi-instance** operational maturity. This doc is **pillar 16 only**; it complements [`realtime-scaling.md`](../../infra/realtime-scaling.md) and [`STACK.md`](../../overview/STACK.md) for transport and scale stance.

**Method:** Point weights below were **planning estimates** for the “74% → 100%” initiative; most ledger items are now **shipped** in-repo. Re-score STATUS when you add vendor overlays, richer default tracing, or RUM.

---

## 1. What is already “green” (current)

Verified against the codebase and in-repo ops docs.

| Capability                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prometheus exposition**           | **`GET /api/v1/metrics`** ([`health.ts`](../../../server/backend/src/api/routes/health.ts)) returns `prom-client` registry text; default Node metrics prefixed `echo_` via [`echoMetrics.ts`](../../../server/backend/src/observability/echoMetrics.ts).                                                                                                                                                                                                                                                                                           |
| **Domain metrics (Echo)**           | Socket **branch**, **`message_failed`**, **persist**, **handler duration**, **workspace** events / snapshot rejections, **permission** denials, **snowflake** wait + sequence, **message search** duration + result count; **REST RED** slice: `echo_rest_http_requests_total`, `echo_rest_http_request_duration_seconds` (label `route_group`); **`echo_dm_open_total{outcome}`**. Wired from handlers, routes, and [`echoHttpObservability.ts`](../../../server/backend/src/bootstrap/echoHttpObservability.ts).                                 |
| **Alert / recording rules as code** | [`server/ops/monitoring/prometheus/rules/`](../../../server/ops/monitoring/prometheus/rules) — failures, socket `reject_unknown` vs `echo_persisted`, snowflake wait rate, search p95. Scrape and layout: [`server/ops/monitoring/README.md`](../../../server/ops/monitoring/README.md).                                                                                                                                                                                                                                                           |
| **Starter Grafana**                 | [`server/ops/monitoring/grafana/echo-overview.json`](../../../server/ops/monitoring/grafana/echo-overview.json) — import and point at your Prometheus datasource.                                                                                                                                                                                                                                                                                                                                                                                  |
| **Structured logs**                 | Fastify/pino with stable **`msg`** keys; **`registerEchoHttpObservability`** binds **`correlationId`** on `req.log` from Fastify **`X-Request-Id`** / `req.id`. [`gatherEchoPostMessageFailureDiagnostics`](../../../server/backend/src/domain/echoStore/members/access.ts) accepts optional **`correlationId`**; REST message post and socket handler pass it through. Sockets: optional **`X-Request-Id`** on handshake used when the message payload has no `correlationId` ([`handlers.ts`](../../../server/backend/src/sockets/handlers.ts)). |
| **Health endpoint**                 | **`GET /api/v1/health`** — DB, optional NATS, `useMockDb` ([`health.ts`](../../../server/backend/src/api/routes/health.ts)).                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Runbooks**                        | [`snowflake-cutover.md`](../runbooks/snowflake-cutover.md), [`postgres-incident.md`](../runbooks/postgres-incident.md), [`nats-socketio.md`](../runbooks/nats-socketio.md), [`jwt-socket-auth.md`](../runbooks/jwt-socket-auth.md), [`multi-replica-socketio.md`](../runbooks/multi-replica-socketio.md). Linked from STATUS §9 and cross-linked from [`realtime-scaling.md`](../../infra/realtime-scaling.md) §Validation.                                                                                                                        |
| **Architecture alignment**          | [`STACK.md`](../../overview/STACK.md), [`ECHO_CONTRACT_V1.md`](../../contracts/ECHO_CONTRACT_V1.md) §Metrics (scrape path, series list, cardinality note, pointer to `server/ops/monitoring/`).                                                                                                                                                                                                                                                                                                                                                    |

**OpenTelemetry (optional):** The Node process loads **`@opentelemetry/sdk-node`** with auto-instrumentation when **`OTEL_EXPORTER_OTLP_ENDPOINT`** is set ([`otel.ts`](../../../server/backend/src/observability/otel.ts)); otherwise the SDK does not start (no overhead). This is **orthogonal** to **`X-Request-Id` / `correlationId`** logging (§7). **Frontend RUM** and **vendor-specific** Grafana Cloud / Datadog wiring stay outside this repo.

---

## 2. What remains thin or out of repo scope

| Area                                | Symptom                                                                                                  | Impact                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Distributed tracing**             | **Optional** OTel auto-instrumentation when **`OTEL_EXPORTER_OTLP_ENDPOINT`** is set; otherwise no spans | Deeper custom spans / socket coverage = future work (§4, §7).       |
| **Log retention / PII policy**      | Rich diagnostics and analytics-style logs                                                                | Compliance narrative may need org-level retention/redaction policy. |
| **Frontend / client observability** | No first-party RUM doc or error pipeline here                                                            | Pillar 16 in-repo is **backend-ops-centric**.                       |
| **Enterprise IRP**                  | No full security incident response playbook                                                              | Broader than Echo repo.                                             |

---

## 3. Gap ledger (historical) — mostly closed in-tree

The original **~26 point** ledger drove the milestone; primary deliverables are **done**. Remaining effort is **optional capstone** (tracing, vendor config, RUM).

| Pts (was) | Initiative                     | Status in repo                                                                                                                                                                                                                                                            |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6**     | Multi-node / NATS ops + drills | **Done:** [`multi-replica-socketio.md`](../runbooks/multi-replica-socketio.md), [`realtime-scaling.md`](../../infra/realtime-scaling.md) §Validation, [`nats-socketio.md`](../runbooks/nats-socketio.md).                                                                 |
| **5**     | Alert rules + Grafana as code  | **Done:** [`server/ops/monitoring/prometheus/rules/`](../../../server/ops/monitoring/prometheus/rules), [`echo-overview.json`](../../../server/ops/monitoring/grafana/echo-overview.json), [`server/ops/monitoring/README.md`](../../../server/ops/monitoring/README.md). |
| **4**     | Core REST RED metrics          | **Done:** `echo_rest_http_*` + `echo_dm_open_total` in [`echoMetrics.ts`](../../../server/backend/src/observability/echoMetrics.ts), hooks in [`echoHttpObservability.ts`](../../../server/backend/src/bootstrap/echoHttpObservability.ts).                               |
| **4**     | Runbooks beyond snowflake      | **Done:** Postgres, NATS, JWT runbooks + STATUS §9.                                                                                                                                                                                                                       |
| **3**     | Request / correlation ID       | **Done:** Fastify request id + pino child; socket handshake fallback; diagnostics already support `correlationId`.                                                                                                                                                        |
| **2**     | Tracing                        | **Done:** OTel SDK + auto-instrumentation in `otel.ts`.                                                                                                                                                                                                                   |
| **2**     | Docs + STATUS bump             | **Done:** this file + STATUS pillar **16** **100%** (2026-04-03).                                                                                                                                                                                                         |

---

## 4. Suggested sequencing (for future work)

1. **OpenTelemetry depth** — Optional today via `OTEL_EXPORTER_OTLP_ENDPOINT` (§7); extend with custom spans or socket coverage as needed.
2. **Vendor dashboards** — Private overlay for Grafana Cloud / Mimir / Datadog.
3. **RUM / client errors** — Product initiative outside backend-only pillar scope.

---

## 5. What this doc does _not_ cover

- **Security incident response** (full IRP).
- **Vendor-specific** hosted observability setup — keep in private infra repos.
- **Load testing** as a product — treat as roadmap work; pair with `[STACK.md](../../overview/STACK.md)` capacity assumptions.

---

## 6. Key file map (quick navigation)

| Concern                       | Location                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Metrics registry              | [`server/backend/src/observability/echoMetrics.ts`](../../../server/backend/src/observability/echoMetrics.ts)             |
| REST RED + correlation logger | [`server/backend/src/bootstrap/echoHttpObservability.ts`](../../../server/backend/src/bootstrap/echoHttpObservability.ts) |
| Metrics HTTP route            | [`server/backend/src/api/routes/health.ts`](../../../server/backend/src/api/routes/health.ts) (`/metrics`)                |
| Contract metrics list         | [`docs/contracts/ECHO_CONTRACT_V1.md`](../../contracts/ECHO_CONTRACT_V1.md) §Metrics                                      |
| Prometheus rules              | [`server/ops/monitoring/prometheus/rules/`](../../../server/ops/monitoring/prometheus/rules)                              |
| Runbooks                      | [`docs/operations/runbooks/`](../runbooks/)                                                                               |
| Multi-instance realtime       | [`docs/infra/realtime-scaling.md`](../../infra/realtime-scaling.md)                                                       |

---

## 7. OpenTelemetry / distributed tracing — **Complete**

**Status:** Echo now registers the OpenTelemetry Node SDK with auto-instrumentation for HTTP and Fastify.

- `@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node` integrated in `server/backend/src/observability/otel.ts`.
- Exporter config via **`OTEL_EXPORTER_OTLP_ENDPOINT`** (and related `OTEL_*` variables per the OTel spec).
- Trace headers are **orthogonal** to the app’s **`X-Request-Id` / `correlationId`** contract.

This integration brings pillar **16** to **100%** completion.

---

_Last aligned with repo behavior as of **2026-03-27**. Re-verify before external commitments._
