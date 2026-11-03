#!/usr/bin/env bash
set -euo pipefail
# Build an application-only release from the current checkout.
# No AWS resources are created. No runtime configuration or secrets are bundled.
app_root="$(cd "$(dirname "$0")/.." && pwd)"
output_path="${1:-appflow-ec2-release.tgz}"
command -v npm >/dev/null
cd "$app_root/backend"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
cd "$app_root"
node --test tests/*.test.mjs
tar -czf "$output_path" \
  --exclude='backend/.env' \
  --exclude='backend/dashboard.env' \
  --exclude='*.pem' \
  --exclude='*.key' \
  backend dashboard deploy tests docs README.md
echo "Created application-only bundle: $output_path"
echo "Deploy through an approved existing software-distribution path."
