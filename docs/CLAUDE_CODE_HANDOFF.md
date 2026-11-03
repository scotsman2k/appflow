# Claude Code implementation brief: AppFlow on an existing EC2 three-tier application

## Role and objective

You are the implementation harness for AppFlow. The source repository is an application-only package that visualizes a pre-existing AWS three-tier architecture. Your mission is to adapt, install and verify this application against the **already deployed** ALB, EC2 Auto Scaling group, RDS PostgreSQL and S3 resources, using only approved workload access and the existing application release path.

The result should be an executive-quality, live diagram that displays the actual AWS asset names and IDs in their correct topology. Animated traffic shows which EC2 returned a browser-originated request. Successful RDS and S3 arrows must correspond to actual read-only operations initiated by the responding EC2, and failures must be visible rather than simulated green success.

## Non-negotiable boundaries

- **No Terraform or infrastructure provisioning.** Do not create or change AWS resources, IAM policies/roles, ALB listeners/rules, target groups, security groups, subnets, VPC endpoints, S3 buckets, RDS instances, secrets or KMS keys.
- **No organization-specific names or marks in public source.** Do not include any employer or personal name, logo, tenant ID, real account ID, private DNS name, RFC1918 allocation, deployment hostname or private repository address in code, docs, tests, screenshots or Git history.
- **No credentials.** Do not commit or print AWS access keys, session tokens, database passwords, private keys, certificate private material, Secrets Manager values, cookie secrets or authorization headers. Configuration examples use unmistakably synthetic placeholders.
- **No public live telemetry.** Live inventory includes sensitive topology. Deploy it behind the already approved internal HTTPS endpoint and authentication controls. Public demo mode must be strictly synthetic.
- **No live infrastructure failure/scale actions.** UI controls may simulate in a disconnected demo, but real mode must disable them.
- Use IMDSv2 and existing instance roles. Use real TLS verification for PostgreSQL and the existing approved S3 network path; never bypass TLS or introduce public subnets/NAT.

## Repository entry points

- `README.md`: project scope and quick start.
- `backend/server.mjs`: loopback HTTP server, health, JSON endpoints and injected page context.
- `backend/identity.mjs`: IMDSv2 EC2 identity.
- `backend/inventory.mjs`: read-only AWS discovery and existing ALB health.
- `backend/probes.mjs`: TLS `SELECT 1` and S3 `HeadObject`.
- `backend/config.mjs`, `backend/.env.example`: strict runtime settings.
- `dashboard/index.html`, `app.js`, `styles.css`: interactive diagram, event stream and security indicator.
- `deploy/`: optional application-only installation and existing-web-server proxy snippets.
- `tests/`, `.github/workflows/ci.yml`: automated verification.
- `docs/EXISTING_STACK_RUNBOOK.md`: operator procedure and rollback.
- `docs/VALIDATION_MATRIX.md`: acceptance proof.

## Implementation procedure

### Understand the existing workload

Read the current app server, reverse proxy, process supervisor, AMI/user-data deployment mechanism and approved release pipeline before proposing edits. Discover actual EC2 OS, Node/runtime availability, existing HTTP route conventions and authentication inheritance. Do not assume the target uses Nginx or Apache; examples are provided for both.

Collect read-only AWS inventory through an approved session. Confirm existing ASG, attached target group, target-health states, ALB hostname, RDS engine endpoint and instance role. Identify existing source S3 bucket, replicated destination label and a readable object. Never put discovered real identifiers into tracked files. Use `docs/asset-mapping.example.json` as a local, untracked worksheet if necessary.

### Verify the application unmodified

From a local/CI checkout:

```bash
cd backend
npm ci --omit=dev --ignore-scripts
npm test
npm run check
cd ..
node --check dashboard/app.js
APP_MODE=local-test node backend/server.mjs
```

From another terminal:

```bash
curl -fsS http://127.0.0.1:8787/api/demo/health
curl -fsS http://127.0.0.1:8787/api/demo/identity
curl -fsS http://127.0.0.1:8787/api/demo/inventory
curl -fsS http://127.0.0.1:8787/api/demo/request
```

Assert that the identity is `i-local-test`, inventory mode is `local-test`, dependencies are an empty array, RDS/S3 check routes return HTTP 403, and the UI visibly identifies local test. Stop this process before starting live service.

### Map application routes to the existing listener

Install the Node process alongside the current app, listening on loopback `127.0.0.1:8787`. Preserve existing web-app behavior and target-group port. Add only path proxying for `/dashboard/` and `/api/demo/` in the existing authorized HTTPS virtual host. Retain authentication on both routes. Do not add another ALB target group or listener. Handle route collisions by namespacing both backend and frontend consistently.

If the existing server is not compatible with the supplied snippets, create a minimal proxy adaptation in the existing web application's code or approved server configuration. Do not overwrite another application's virtual host. Demonstrate that its preexisting health and business endpoints continue working.

### Use actual EC2 and AWS topology

`/api/demo/identity` and every `/api/demo/request` must return actual IMDSv2 instance identity. The HTML response's `pageInstanceId` identifies the page-serving EC2 and is not reused as the identity of a subsequent request.

`/api/demo/inventory` must fetch current ASG membership, EC2 instance details and tags, subnet and VPC metadata, existing target-group health, optional ALB metadata and RDS metadata. Cache briefly and show stale/error indication on a failed refresh. Validate the discovered ASG and target group match the preexisting deployed workload. In the UI, never substitute example IDs as live resources.

Traffic animation must route from users → ALB → **the instance named by that actual request response**. If inventory cannot map the ID to a visible node, log the unmapped response and withhold that specific arrow. The event log must show request ID, exact responder, and observed duration. Distinguish application response latency from ALB and browser round-trip time.

### Validate the database and S3 dependencies

Start `ENABLE_DEMO_PROBES=false`; only enable after the existing instance role, private connectivity, read-only database identity, existing secret reference and certificate trust are confirmed.

With probes enabled, a demo request runs both operations on the responding instance:

- RDS: retrieve existing secret at runtime with the workload role, verify server TLS certificate using the known CA bundle, establish PostgreSQL connection and issue `SELECT 1`. Capture measured duration and typed error class, not secret values or SQL business data.
- S3: perform `HeadObject` against an existing known key in the existing source bucket. Capture measured duration and typed error class. Do not create the sentinel in this project. A source check does not establish destination replication success.

Show both actual results beside the architecture and animate EC2 → RDS and EC2 → S3 only after successful or failed calls. Failed paths should draw red. The browser's manual check button uses whichever EC2 the existing ALB selects; it cannot force a selected target. The UI must accurately describe this.

### Autoscaling resilience

A manual installation on a single instance is insufficient. Fit the application into the already approved, existing fleet bootstrap or release mechanism and verify a *replacement* EC2 has the same Node package, service, configuration, proxy routes, and permissions. Do not modify ASG resources within this task. Coordinate any necessary rollout change through the application's owner.

### Security and data handling

- Restrict the live dashboard to the existing authorized audience.
- No cross-origin credentials or wildcard CORS; keep API on the same HTTPS origin.
- Keep HTTP method surface read-only, rate-limited, and loopback-bound.
- Avoid logging personal user data, database data, tokens or full secret errors.
- Confirm production CSP, referrer, cache and framing protections remain in place.
- Do not introduce direct browser AWS SDK calls or static cloud credentials.
- During tests, never put real resource identifiers in a public issue, PR body or screenshots.

## Definition of done

- [ ] Every test in `npm test` and `npm run check` passes.
- [ ] No Terraform, infrastructure provisioning, resource-creation instructions, credentials or branding appear in the repository.
- [ ] Existing ALB and web application still work; new paths are served over the existing HTTPS origin.
- [ ] Each EC2 instance responds with its own distinct IMDSv2 ID.
- [ ] Dashboard initial HTML reveals the actual HTML-serving EC2; subsequent request event names the actual API-serving EC2.
- [ ] At least two healthy targets are shown when the existing ASG has two; the browser sees multiple responders in a reasonable sample, without claiming uniform balancing.
- [ ] Live AWS names replace demo values; missing mappings are visibly unknown rather than fabricated.
- [ ] Successful RDS `SELECT 1` and S3 `HeadObject` paths animate from the actual responder.
- [ ] Deliberate negative dependency tests show failed checks, not green arrows.
- [ ] Live scale/fail simulation controls are disabled.
- [ ] Unauthenticated access to both dashboard and JSON API is blocked.
- [ ] A freshly replaced ASG instance starts the same application through the existing deployment mechanism.
- [ ] No existing cloud resources were created or modified by this codebase.
- [ ] Private evidence bundle contains commit, release checksum, observed request IDs/target mapping, probe results and documented rollback.

## Required final handoff

Report the exact application commit, test results, internal deployment path, configured endpoint names **redacted in external output**, number of observed unique responders, RDS/S3 result, existing app health, limitations, and rollback status. Separate *implemented and locally tested* from *verified in the target AWS account*. Do not claim successful live AWS connectivity until tested on the user's EC2 fleet.

Consult `docs/EXISTING_STACK_RUNBOOK.md` and `docs/VALIDATION_MATRIX.md` before changing any runtime configuration.
