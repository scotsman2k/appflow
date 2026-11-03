# Validation and evidence matrix

This document defines what can be proven by the AppFlow adapter and which observations do not support broader claims.

## Predeployment local validation

| Check | Command / step | Pass condition |
| --- | --- | --- |
| Locked dependencies | `cd backend && npm ci --omit=dev --ignore-scripts` | Installs from reviewed lockfile |
| Unit and integration | `cd backend && npm test` | All Node tests pass, including local HTTP adapter |
| Backend syntax | `cd backend && npm run check` | No syntax errors |
| Frontend syntax | `node --check dashboard/app.js` | No syntax errors |
| Brand/secret audit | Inspect tracked source and Git history | No personal/employer marks, credentials, private hosts or real IDs |
| Package audit | `tar -tzf appflow-ec2-release.tgz` | Only app, templates, tests and documentation; no runtime env file |

## Existing EC2 and ALB validation

| Signal | Check | Exact pass criteria | Cannot conclude |
| --- | --- | --- | --- |
| Web service | On EC2: `curl -fsS http://127.0.0.1:8787/api/demo/health` | `ok:true` | Business app is healthy |
| Instance identity | On each EC2: `curl -fsS http://127.0.0.1:8787/api/demo/identity` | Matches that EC2's IMDSv2 identity | ALB actually routes to it |
| Page identity | On each EC2: fetch `/dashboard/` | Embedded `pageInstanceId` matches serving EC2 | All follow-on requests use same EC2 |
| ALB identity | Via existing HTTPS origin: `/api/demo/request` | HTTP 200, JSON `instanceId`, `requestId`, `latencyMs`, header `X-Served-By-Instance` | Every client/request is observed |
| Distribution | Repeat 30+ requests with ordinary client behavior; compare IDs | Multiple distinct responders if target group has multiple healthy members | Even distribution, no sticky sessions, every member accessed |
| Inventory | Via HTTPS: `/api/demo/inventory` | Correct ASG, member names, target health, VPC/subnets, RDS/S3 labels | All resources healthy end-to-end |
| UI topology | Compare diagram node IDs to JSON inventory | Every visible live EC2 matches source; unknown response never mapped to fake node | Complete coverage beyond six slots |
| Browser animation | Send individual requests and watch event log | Animation arrives at the exact JSON responder instance | Packet-level network capture |
| Authz | Attempt unauthenticated requests to both prefixes | Existing access gate denies dashboard and API | Complete security posture |
| Existing app | Exercise its original business and health paths | No regressions; ALB target health unchanged | No load or availability impact under all conditions |
| Scale replacement | Observe a newly launched replacement ASG member through existing lifecycle | AppFlow service, proxy and config are present automatically | Infrastructure automation changed by this project |

## Live RDS/S3 probes

Probes run only with `ENABLE_DEMO_PROBES=true`. Configure existing DB host/name, existing secret reference, CA bundle and S3 sentinel **on the instance**, not in Git. The UI distinguishes not tested, healthy and failure.

| Path | API | Success | Useful negative test | Proof boundary |
| --- | --- | --- | --- | --- |
| EC2 → RDS PostgreSQL | `/api/demo/check/rds` | `{"kind":"rds","ok":true,"operation":"SELECT 1"}` and measured `latencyMs` | Use a known nonexistent database name in a controlled non-prod runtime config, or run against a sanctioned disconnected test endpoint; restore config | TLS database session can execute `SELECT 1`; no business data verified |
| EC2 → S3 | `/api/demo/check/s3` | `{"kind":"s3","ok":true,"operation":"HeadObject"}` and measured `latencyMs` | Use an intentionally nonexistent key in a controlled non-prod runtime config; restore config | One object HEAD succeeded; no write or replica state verified |
| EC2 → S3 replica | None in this release | Explicitly not tested | Not applicable | Replica label is inventory/configuration, not proof of replication |

Avoid revoking live IAM or security groups merely to create a demo failure. Use controlled runtime-only test values in a nonproduction account, or mock the probe during local test development. Never create real customer data or modify infrastructure for a test.

The automatic `/api/demo/request` call may execute both probes for each browser request when enabled. In a production-like demo, pause the generator when not presenting and constrain users/requests to avoid unnecessary DB load.

## Internal smoke test

```bash
BASE_URL=https://existing-application.example.internal EXPECT_MIN_INSTANCES=2 bash tests/smoke.sh
BASE_URL=https://existing-application.example.internal EXPECT_PROBES=true bash tests/smoke.sh
```

The second command validates dependency probe endpoints and should be run only after they are explicitly enabled and approved. Use `CA_CERT=/path/to/approved-ca.pem` when required by internal PKI. Never use `curl -k` to suppress verification.

Expected HTTP failures:

- `403` on probe endpoint while probes are disabled: **expected**, not a broken deployment.
- `429` when demo traffic exceeds the in-process rate cap: expected throttle signal; adjust viewer demand.
- `503` with typed error when AWS inventory fails: failure; do not render stale claims as fresh without a warning.
- `404` on unknown paths: expected.
- `405` on POST: expected, adapter is intentionally read-only.

## Fleet size and metrics honesty

- SVG supports three EC2 slots per each of two AZs, six total. The discovery API may return more. Unmapped live responses produce explicit warnings.
- The request counter is **this browser's observed demo calls**, not ALB's complete `RequestCount`.
- RDS and S3 durations are SDK/query durations measured by the responding EC2. They are not packet captures or full end-user latency.
- Target health is the latest ELBv2 state and ASG lifecycle state, not proof that the application transactions succeed.
- Replica status cannot be inferred from a primary-bucket `HeadObject`.

## Screenshot evidence package, internal only

Capture the dashboard with `LIVE AWS RESPONSES`, two AZs, actual EC2 display names, ALB name, RDS name, S3 name, and an event showing a matching request ID and responder. Add the network proof: successful RDS and S3 probes, timestamps, and expected failure results. Store internal resource IDs only in an approved private evidence location. Public images must use synthetic local-test data.

## Release decision

Accept only when the existing app still works, live identity has been verified on more than one healthy EC2 if available, auth boundaries hold, dependency probes are correctly attributed and reported, deployment survives replacement, and rollback is documented. Otherwise report the exact failing check; do not mark it production-ready.
