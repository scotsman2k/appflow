# Application-only integration runbook

## Scope and change boundary

AppFlow is a *sidecar web application* for an existing three-tier AWS deployment. The existing VPC, private app subnets, EC2 ASG, ALB, HTTPS listener, target group, RDS PostgreSQL instance and S3 buckets are assumed operational.

This guide makes **no AWS resources**. Do not generate, apply or change Terraform, CloudFormation, IAM roles, KMS keys, S3 policies, networking, load balancers or database infrastructure in this workstream. Treat gaps in existing permissions, DNS, routing and access policies as deployment blockers to be resolved through the established platform change process, not by this repository.

## Expected request paths

```text
Authorized browser (existing internal HTTPS origin)
  -> existing HTTPS listener and target group
  -> existing app web server on whichever EC2 the ALB selected
     -> GET /dashboard/       -> loopback AppFlow Node process (HTML with EC2 ID)
     -> GET /api/demo/request -> loopback AppFlow Node process (actual target ID)
          -> optional RDS TLS SELECT 1
          -> optional S3 HeadObject
     -> GET /api/demo/inventory -> AWS read-only Describe calls
```

Browser animation shows only the verified instance returned by that specific request. A browser request is not a packet capture. Other application users are invisible unless the existing application is separately instrumented and an authorized event feed is implemented.

## Preflight inventory, read-only

Operate through an approved AWS role and SSM session; no long-lived IAM user keys. Record identifiers **outside public source control**. Do not print secret values.

```bash
aws sts get-caller-identity
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names EXISTING_ASG_NAME --query 'AutoScalingGroups[0].{Instances:Instances[*].InstanceId,TargetGroupARNs:TargetGroupARNs,Min:MinSize,Max:MaxSize,Desired:DesiredCapacity}'
aws elbv2 describe-target-health --target-group-arn EXISTING_TARGET_GROUP_ARN
aws ec2 describe-instances --instance-ids EXISTING_INSTANCE_ID --query 'Reservations[].Instances[].{Id:InstanceId,Subnet:SubnetId,Vpc:VpcId,Az:Placement.AvailabilityZone,IamProfile:IamInstanceProfile.Arn}'
aws rds describe-db-instances --db-instance-identifier EXISTING_RDS_ID --query 'DBInstances[].{Endpoint:Endpoint.Address,Port:Endpoint.Port,MultiAZ:MultiAZ,Status:DBInstanceStatus}'
aws s3api head-object --bucket EXISTING_SOURCE_BUCKET --key EXISTING_READABLE_OBJECT_KEY
aws secretsmanager describe-secret --secret-id EXISTING_SECRET_ARN --query '{Name:Name,Arn:ARN,KmsKeyId:KmsKeyId}'
```

Confirm before proceeding:

- The current EC2 role can use IMDSv2 and read ASG/instance/VPC/subnet/ALB target-health inventory.
- The existing HTTPS web server can add two path proxies without replacing its application routing or authentication.
- The existing approved private connectivity path reaches the AWS control-plane APIs.
- When probes are enabled, EC2 can resolve/connect to PostgreSQL on TCP 5432 with TLS and can reach the existing S3 bucket through approved private HTTPS connectivity.
- The RDS secret, TLS CA bundle, S3 object, IAM/bucket policy and relevant KMS grants **already exist**. If any do not, leave probes disabled and mark the dependency check unverified.

## Prepare the application in CI or an approved build host

Prerequisite: Node.js 20+, package registry access via the approved route, existing project checkout.

```bash
cd backend
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
npm test
npm run check
cd ..
node --check dashboard/app.js
bash deploy/build-release.sh appflow-ec2-release.tgz
```

The archive includes application source, locked dependencies, deployment examples and docs. It excludes known credential filename patterns. Still inspect the archive contents before distributing and ensure no private runtime config has been placed in the checkout:

```bash
tar -tzf appflow-ec2-release.tgz | sed -n '1,60p'
```

Use an approved existing code-delivery pipeline, AMI bake process, or private artifact distribution. Do not copy tokens, `.env` files or database passwords into Git, images, or artifacts.

## Runtime configuration, on the instance only

Use `backend/.env.example` as the schema for the environment file. The file is runtime configuration, not a deployable source artifact. Every EC2 instance must have matching config. The placeholder resource identifiers in the public example are synthetic.

Suggested owner/location:

```text
/etc/architecture-dashboard/dashboard.env
/opt/architecture-dashboard/backend
/opt/architecture-dashboard/dashboard
/etc/pki/tls/certs/rds-global-bundle.pem
```

Start conservatively with `ENABLE_DEMO_PROBES=false`. When false, the backend reports actual instance/request identity and inventory without opening a database connection or reading S3. UI statuses remain not tested until actual checks occur.

To enable probes, refer to an **existing** Secrets Manager secret containing the PostgreSQL username and password, and to an existing database user with the minimum rights to run `SELECT 1`. Do not pass plaintext passwords through environment variables, command lines, GitHub Actions variables, committed config, or agent conversations. The instance role, secret policy, KMS permissions and service endpoints must permit fetching that existing secret. The CA bundle must validate the RDS server certificate; do not set `rejectUnauthorized=false`.

Do not use a business-critical mutable object as the S3 sentinel. Use a small **existing** key whose object read is already authorized. A successful source `HeadObject` does not prove a replica is up to date.

## Install without modifying the existing application

On each existing EC2 ASG member, after transferring and unpacking the release:

```bash
sudo bash deploy/install-on-ec2.sh /path/to/unpacked/appflow --check
sudo bash deploy/install-on-ec2.sh /path/to/unpacked/appflow --apply
systemctl status architecture-dashboard --no-pager
journalctl -u architecture-dashboard -n 50 --no-pager
curl --fail --silent --show-error http://127.0.0.1:8787/api/demo/health
curl --fail --silent --show-error http://127.0.0.1:8787/api/demo/identity
curl --fail --silent --show-error http://127.0.0.1:8787/api/demo/inventory
```

The installer creates only an OS service account if absent, copies application files, installs one systemd unit and restarts **that unit**. It does not edit or reload Nginx/Apache, adjust ALB settings, grant IAM privileges or create AWS resources. Confirm the service is listening on `127.0.0.1:8787` and does not conflict with the existing web process.

For fleets managed by Auto Scaling, a one-off manual copy is not persistent. Integrate this exact application release and runtime configuration into the existing approved rollout mechanism for the launch template/AMI/user data. Validate replacement instances, with no infrastructure definitions added to this repo.

## Wire the already-running HTTPS virtual host

Choose the serving web server. Place the relevant routing snippet into the **existing** HTTPS virtual host, with existing authentication and authorization applied identically to both route prefixes:

- Nginx: `deploy/nginx-existing-app.locations.conf`
- Apache: `deploy/apache-existing-app.conf`

Required paths:

| External path | Internal target | Purpose |
| --- | --- | --- |
| `/dashboard/` | `http://127.0.0.1:8787/dashboard/` | HTML, JS and CSS |
| `/api/demo/` | `http://127.0.0.1:8787/api/demo/` | Identity, inventory, request attribution and probe APIs |

Do **not** add a new ALB listener, host rule or target group. The existing ALB selects the same registered EC2 web server as before. Path-based reverse proxying inside that server forwards the request locally.

Important routing details:

- The proxy must preserve the full path and should not redirect API requests to an authentication splash page that returns HTTP 200 HTML.
- Keep the approved ALB TLS policy; use HTTPS at the existing origin, with no insecure certificate bypass.
- Nginx `location ^~` may override regex location handling. Confirm the existing authentication directives apply explicitly to the new paths, including authorization on API JSON endpoints.
- If the existing app already uses `/dashboard/` or `/api/demo/`, select a collision-free prefix and change **both backend routes and frontend API path** consistently before deployment.
- Review the proxy change using `nginx -t` or `apachectl configtest`; reload only through the existing controlled deployment process.

## Functional validation, progressive

**Local loopback on every EC2**: Verify `/api/demo/health` returns JSON `{"ok":true}`; `/api/demo/identity` must report that instance's actual `i-...` value, derived from IMDSv2. The `/dashboard/` HTML must contain that same ID. If it reports `i-local-test`, the instance was started in the wrong mode; stop the rollout.

**Through the existing internal HTTPS origin**: Verify `/dashboard/`, `/api/demo/identity`, `/api/demo/inventory` and `/api/demo/request`. Repeat the request endpoint and record unique `instanceId` values. Cross-check with target-health and instance inventory. Use the optional internal smoke script:

```bash
BASE_URL=https://existing-application.example.internal EXPECT_MIN_INSTANCES=2 bash tests/smoke.sh
```

**RDS**: If the secret and network paths have already been approved, enable `ENABLE_DEMO_PROBES=true` in the runtime-only file and restart only `architecture-dashboard`. Use `/api/demo/check/rds`: `ok:true`, operation `SELECT 1` and measured latency must appear. Verify the UI animates EC2 → RDS only on a returned actual check result. A failure must display the typed error code and a failed state.

**S3**: Use `/api/demo/check/s3`: `ok:true`, operation `HeadObject`. Missing object (404), access denied (403), KMS failure or private endpoint issues must not appear green. Verify the UI animates EC2 → S3 based on this result.

**Replica**: The replica is drawn as an expected architecture component only. If someone needs actual replication proof, implement an independent destination `HeadObject` and object/version comparison through approved identity and network paths, while clearly distinguishing source access from replication status. Do not infer replication from a single source operation.

## Acceptance evidence to capture privately

- Git commit SHA and SHA of the release artifact.
- Instance-by-instance `/api/demo/identity` results, redacted for external sharing.
- Existing ASG member and target-health comparison.
- At least two distinct live responder IDs, when two healthy targets are expected and available.
- Screenshot of flow path and event containing the same actual responder ID.
- Successful and intentional unsuccessful RDS/S3 check results, with no secrets in logs.
- Screenshot of the live-mode badge, with simulated controls disabled.
- Authentication check: unauthorized callers cannot retrieve topology or JSON.
- Replacement ASG instance receives the same application automatically.
- Existing web app and target group health remain unchanged.
- Rollback time and restored status.

## Troubleshooting map

| Symptom | Likely cause | Non-invasive check |
| --- | --- | --- |
| HTML loads, requests return 404 | Missing `/api/demo/` reverse-proxy location | Inspect existing web server path configuration |
| HTTP 200 body is HTML rather than JSON | Existing login redirect/intercept or route collision | Check response `Content-Type` and auth policy |
| `i-local-test` on EC2 | `APP_MODE=local-test` accidentally used | Inspect runtime-only env and service startup log |
| Dashboard cannot identify EC2 | IMDSv2 not reachable from service process | On host, validate IMDSv2 through approved tooling |
| No instances in topology | ASG name wrong, Describe denied, region mismatch, or target group mismatch | Read-only AWS Describe commands above |
| EC2 green but RDS red | DB endpoint/port, secret access, TLS CA, DB user or SG | Test name resolution/TLS and review typed error |
| S3 red | Nonexistent sentinel, bucket/endpoint/key permissions, DNS, region | Read-only HeadObject from same runtime identity |
| All requests from one instance | ALB stickiness, connection reuse, only one healthy target or small sample | Compare target-health and repeat distinct clients |
| Probe rate limiting (429) | Too many viewers, 10/sec process guard | Lower browser demand; do not remove controls unreviewed |
| Connection fails after scale-out | Bootstrap/release not included on new ASG member | Compare image/startup logs and service status |

## Rollback

Remove the two AppFlow path locations from the existing web server configuration and restore its previous approved version. Reload only through the existing deployment process. Stop and disable the AppFlow systemd unit if necessary:

```bash
sudo systemctl disable --now architecture-dashboard
```

Leave the existing application, ALB listener, target group, IAM, RDS, S3 and network untouched. If an AMI/release rollout included AppFlow, revert through the organization's existing application-release rollback process. Do not invoke infrastructure destroy or replacement commands.

## Constraints and future work

The SVG currently has **six instance slots across two AZs**. The backend can discover a larger fleet, but only the first three instances per displayed AZ are drawn. A response from an undisplayed target is logged as unmapped and is not animated to a fabricated machine. Expand responsive layout and membership paging before asserting full-fleet coverage.

Request counts are browser-session counts. To show *all* business application traffic, instrument the existing web application's structured logs and connect an authenticated, privacy-reviewed event stream. This is a separate release, not implied by the current AWS inventory metrics.
