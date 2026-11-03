#!/usr/bin/env bash
set -euo pipefail
# BASE_URL is the existing internal HTTPS application origin.
# CA_CERT may name an approved internal CA file, no -k/insecure bypass.
# EXPECT_MIN_INSTANCES=2 validates distribution, but does not guarantee even balance.
# EXPECT_PROBES=true performs real read-only RDS/S3 checks.
for bin in curl jq sort uniq mktemp; do command -v "$bin" >/dev/null || { echo "Missing $bin" >&2; exit 2; }; done
: "${BASE_URL:?Set BASE_URL to the existing internal HTTPS application origin}"
: "${EXPECT_MIN_INSTANCES:=1}"
: "${EXPECT_PROBES:=false}"
curl_args=(--silent --show-error --fail-with-body --connect-timeout 5 --max-time 20)
if [[ -n "${CA_CERT:-}" ]]; then curl_args+=(--cacert "$CA_CERT"); fi
base="${BASE_URL%/}"
echo "Validating existing HTTPS web-app path: $base"
curl "${curl_args[@]}" "$base/api/demo/health" | jq -e '.ok == true'
curl "${curl_args[@]}" "$base/dashboard/" | grep -q 'Infrastructure in motion'
curl "${curl_args[@]}" "$base/api/demo/identity" | jq -e '.instanceId | startswith("i-")'
curl "${curl_args[@]}" "$base/api/demo/inventory" | jq -e '.mode == "live" and (.instances | type == "array")'
sample_file="$(mktemp)"
trap 'rm -f "$sample_file"' EXIT
for _ in $(seq 1 30); do
  curl "${curl_args[@]}" "$base/api/demo/request" | jq -r '.instanceId' >> "$sample_file"
done
sort "$sample_file" | uniq -c
observed="$(sort -u "$sample_file" | wc -l | tr -d ' ')"
if [[ "$observed" -lt "$EXPECT_MIN_INSTANCES" ]]; then
  echo "Only $observed distinct target(s) observed; expected $EXPECT_MIN_INSTANCES." >&2
  exit 1
fi
if [[ "$EXPECT_PROBES" == "true" ]]; then
  for dependency in rds s3; do
    curl "${curl_args[@]}" "$base/api/demo/check/$dependency" | jq -e '.ok == true'
  done
fi
echo "PASS: verified $observed responding EC2 instance(s) via the existing ALB"
