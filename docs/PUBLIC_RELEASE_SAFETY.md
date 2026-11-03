# Public-source safety and production exposure

AppFlow source is suitable for public sharing only if it contains **generic examples**. The actual connected dashboard is not automatically safe to expose publicly.

## Allowed in this repository

- Organization-neutral product name, visual design and screenshots with simulated assets.
- Source code for AWS SDK Describe, IMDSv2 and read-only probes.
- Synthetic account number `000000000000`, names like `EXISTING_ASG_NAME`, and private example domains that are unmistakably placeholders.
- Documentation of existing resource permissions and private connectivity prerequisites.
- CI that runs local-test mode only; it must not obtain AWS credentials or query a live account.

## Prohibited in this repository or Git history

- Employer, employee, personal or customer branding.
- Real AWS account numbers, real internal domains, private network CIDRs, private IPs, service endpoints, bucket names, secret ARNs or screenshots from a live account.
- Passwords, access keys, private key material, tokens, auth cookies, KMS plaintext, database dumps, `.env` files or secrets in GitHub Actions variables/outputs.
- Deployment artifacts containing runtime configuration or logs showing real infrastructure identifiers.
- Disabling TLS checks, making the dashboard an unprotected public internet endpoint or displaying cached sample data as live telemetry.

## Runtime privacy boundary

Live routes include `/api/demo/identity`, `/api/demo/inventory`, `/api/demo/request`, and probe endpoints. Inventory may reveal instance IDs, private IPs, subnet IDs, VPC CIDRs, resource names and database endpoints. Use an existing private ALB and application authentication to protect both `/dashboard/` and `/api/demo/`. Do not assume an ALB or Nginx-only restriction is sufficient without an access test.

The application must not collect end-user credentials or store browser tokens. It has no login of its own, so it inherits the existing access control boundary. If that application has none, stop before any live rollout.

Do not enable CORS on the JSON endpoints for arbitrary origins. Keep the Node adapter bound to loopback and use the existing HTTPS host as its sole ingress. Both API and page responses have no-store behavior except versioned static assets. Run security review before any internet-facing deployment.

## Simulation versus live response claims

A synthetic standalone preview is appropriate for a public talk. A connected live dashboard is private operational telemetry. Badges and captions must state exactly which state is shown:

- `LOCAL TEST`: only local synthetic identity, no AWS or dependency calls.
- `LIVE AWS RESPONSES`: actual IMDSv2 identity and observed browser-request responder IDs.
- `Not tested`: a dependency probe has not run.
- `Failed`: actual check returned `ok:false`.
- `Replica configured`: a destination label exists; it says nothing about completed replication.

For a public screenshot, restart in local-test mode or use the separate synthetic static preview. Do not manually redact one label while leaving real IDs or endpoints elsewhere on the page.

## Pre-push checks

```bash
git diff --cached --name-only
git diff --cached --check
git grep -n -I -E 'AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY' -- ':!backend/package-lock.json' || true
git grep -n -I -E 'REPLACE_WITH_REAL|password[[:space:]]*=' || true
```

A zero hit count from simple patterns is not a complete secrets scan. Run the existing organization's approved secrets-scanning tooling in CI. Review every example and image manually. Do not store the scan's sensitive match content in the public CI log.

## When broader publication is desired

The source can remain public while an internal deployment remains private. A future **public demo deployment** must use synthetic/local-test data and no AWS inventory/probe permissions. Public live metrics require separate threat modeling, authentication, authorization, API filtering, redaction, load controls, audit logs and release approval. Do not switch a connected private dashboard to a public ALB simply because its source code is public.
