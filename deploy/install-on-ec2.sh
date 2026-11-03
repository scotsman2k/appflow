#!/usr/bin/env bash
set -euo pipefail
# Install ONLY the dashboard application into an existing EC2 web tier.
# Does not create or edit ALBs, target groups, subnets, security groups,
# IAM roles, S3 buckets, RDS databases, or existing reverse-proxy configs.
# Usage: sudo bash deploy/install-on-ec2.sh /path/to/unpacked/appflow --check
#        sudo bash deploy/install-on-ec2.sh /path/to/unpacked/appflow --apply
source_dir="${1:?Provide the unpacked appflow directory}"
mode="${2:---check}"
case "$mode" in --check|--apply) ;; *) echo "Use --check or --apply" >&2; exit 2 ;; esac
for relative in backend/server.mjs backend/package-lock.json backend/node_modules dashboard/index.html dashboard/app.js dashboard/styles.css deploy/architecture-dashboard.service; do
  [[ -e "$source_dir/$relative" ]] || { echo "Missing: $source_dir/$relative" >&2; exit 2; }
done
command -v node >/dev/null || { echo "Node.js 20+ is required" >&2; exit 2; }
major="$(node -p 'process.versions.node.split(".")[0]')"
(( major >= 20 )) || { echo "Node.js 20+ is required" >&2; exit 2; }
[[ -r /etc/architecture-dashboard/dashboard.env ]] || { echo "Create a runtime-only /etc/architecture-dashboard/dashboard.env first" >&2; exit 2; }
if [[ "$mode" == "--check" ]]; then
  echo "Application files and runtime configuration located; no changes made."
  echo "Verify existing web proxy route and TLS separately."
  exit 0
fi
[[ "$(id -u)" -eq 0 ]] || { echo "--apply requires root" >&2; exit 2; }
if ! id archdash >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir /nonexistent --shell /sbin/nologin archdash
fi
install -d -m 0755 /opt/architecture-dashboard /opt/architecture-dashboard/backend /opt/architecture-dashboard/dashboard
cp -a "$source_dir/backend/." /opt/architecture-dashboard/backend/
cp -a "$source_dir/dashboard/." /opt/architecture-dashboard/dashboard/
install -m 0644 "$source_dir/README.md" /opt/architecture-dashboard/README.md
chown -R root:root /opt/architecture-dashboard
chmod -R go-w /opt/architecture-dashboard
install -m 0644 "$source_dir/deploy/architecture-dashboard.service" /etc/systemd/system/architecture-dashboard.service
systemctl daemon-reload
systemctl enable architecture-dashboard
systemctl restart architecture-dashboard
systemctl --no-pager --full status architecture-dashboard
echo "Adapter installed on loopback. No reverse-proxy or AWS resource configuration was changed."
echo "Integrate the existing HTTPS virtual host paths from deploy/nginx-existing-app.locations.conf."
