# Echo monitoring (Prometheus / Grafana)

**Doc verified:** 2026-06-01 — scrape path and rule filenames match this repo layout.

Versioned **recording** and **alert** rules for Echo live under `prometheus/rules/`. They assume a Prometheus (or Mimir/VictoriaMetrics Prometheus-compatible) scrape of the Echo API metrics endpoint.

## Scrape configuration

| Field         | Value                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| **HTTP path** | `GET /api/v1/metrics`                                                                                         |
| **Full URL**  | `http://<api-host>:<port>/api/v1/metrics`                                                                     |
| **Format**    | Prometheus text exposition 0.0.4 (`text/plain`)                                                               |
| **Job label** | Use a stable job name per environment, e.g. `echo_api` (convention only; rules below do not filter on `job`). |

Example static config:

```yaml
scrape_configs:
  - job_name: echo_api
    metrics_path: /api/v1/metrics
    static_configs:
      - targets: ['echo-api:3000']
```

TLS, service discovery, and auth are deployment-specific—keep those in your overlay repo or config management.

## Rule files

Load both files (or merge) in Prometheus:

```yaml
rule_files:
  - /path/to/echo/monitoring/prometheus/rules/echo-recording.yml
  - /path/to/echo/monitoring/prometheus/rules/echo-alerts.yml
```

Tune thresholds (`for`, comparison values) per environment after baselining traffic.

## Label conventions (Echo app metrics)

Echo domain metrics use **low-cardinality** labels only (`branch`, `code`, `scope`, `route_group`, `status_class`, `method`, `outcome`, etc.). **Do not** add `channelId`, `userId`, or unbounded path segments as Prometheus labels in custom instrumentation.

Primary series are listed in [`docs/contracts/ECHO_CONTRACT_V1.md`](../../../docs/contracts/ECHO_CONTRACT_V1.md) §Metrics.

## Optional Grafana dashboard

Starter JSON: [`grafana/echo-overview.json`](./grafana/echo-overview.json). Import as a dashboard; set your Prometheus datasource UID or replace `prometheus` in panel targets.

## Related docs

- [Observability pillar → 100%](../../../docs/operations/ops/OBSERVABILITY_OPS_TO_100.md)
- [Multi-replica Socket.IO runbook](../../../docs/operations/runbooks/multi-replica-socketio.md)
- [Realtime scaling](../../../docs/infra/realtime-scaling.md)
