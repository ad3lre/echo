# Echo SBOM and VDR

This directory holds the **Software Bill of Materials** and **Vulnerability
Disclosure Report** for the Echo product tree (npm via `bun.lock`, plus Apple
SwiftPM pins from `clients/apple/Package.resolved`).

| File            | Purpose                                                                         |
| --------------- | ------------------------------------------------------------------------------- |
| `echo.cdx.json` | CycloneDX 1.5 SBOM (component inventory; may include a `vulnerabilities` array) |
| `echo.vdr.json` | Echo VDR — OSV-backed status for known advisories affecting this tree           |

## Regeneration / gate

```bash
bun run check:osv          # refresh SBOM+VDR and fail if OSV finds blocking vulns
bun run sbom:generate      # SBOM only (no OSV network call)
```

`check:osv` is part of `test:ci:guards` → `ci:precheck` (pre-push) and the
GitHub / GitLab security pipelines. Default fail level is **any** known
advisory (`ECHO_OSV_LEVEL=all`). Temporary exceptions go in
`server/ops/scripts/osv-allowlist.json` with a reason and expiry.

See [docs/operations/sbom-vdr.md](../../docs/operations/sbom-vdr.md).
