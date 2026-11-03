export const config = Object.freeze({
  port: Number(process.env.DASHBOARD_PORT || 8787),
  awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
  asgName: process.env.ASG_NAME || "",
  targetGroupArn: process.env.TARGET_GROUP_ARN || "",
  albName: process.env.ALB_NAME || "",
  rdsIdentifier: process.env.RDS_IDENTIFIER || "",
  dbHost: process.env.DB_HOST || "",
  dbName: process.env.DB_NAME || "",
  dbPort: Number(process.env.DB_PORT || 5432),
  dbSecretArn: process.env.DB_SECRET_ARN || "",
  dbCaBundle: process.env.RDS_CA_BUNDLE || "",
  s3Bucket: process.env.S3_BUCKET || "",
  s3SentinelKey: process.env.S3_SENTINEL_KEY || "",
  s3ReplicaBucket: process.env.S3_REPLICA_BUCKET || "",
  inventoryTtlMs: Number(process.env.INVENTORY_TTL_MS || 30000),
  probeTimeoutMs: Number(process.env.PROBE_TIMEOUT_MS || 3500),
  appMode: process.env.APP_MODE || "live",
  localTestMode: process.env.APP_MODE === "local-test",
  enableDemoProbes: process.env.ENABLE_DEMO_PROBES === "true"
});

export function validateConfig(cfg) {
  const errors = [];
  if (cfg.appMode && !["live","local-test"].includes(cfg.appMode)) errors.push("APP_MODE must be live or local-test.");
  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) errors.push("DASHBOARD_PORT must be a TCP port.");
  if (!Number.isInteger(cfg.dbPort) || cfg.dbPort < 1 || cfg.dbPort > 65535) errors.push("DB_PORT must be a TCP port.");
  if (!Number.isInteger(cfg.inventoryTtlMs) || cfg.inventoryTtlMs < 5000) errors.push("INVENTORY_TTL_MS must be at least 5000.");
  if (!Number.isInteger(cfg.probeTimeoutMs) || cfg.probeTimeoutMs < 500) errors.push("PROBE_TIMEOUT_MS must be at least 500.");
  if (!cfg.localTestMode && !cfg.asgName) errors.push("ASG_NAME is required in EC2 mode.");
  if (!cfg.localTestMode && !cfg.targetGroupArn) errors.push("TARGET_GROUP_ARN is required in EC2 mode.");
  if (!cfg.localTestMode && cfg.enableDemoProbes) {
    if (!cfg.dbHost) errors.push("DB_HOST is required when dependency checks are enabled.");
    if (!cfg.dbName) errors.push("DB_NAME is required when dependency checks are enabled.");
    if (!cfg.dbSecretArn) errors.push("DB_SECRET_ARN must reference an existing secret when dependency checks are enabled.");
    if (!cfg.dbCaBundle) errors.push("RDS_CA_BUNDLE is required when dependency checks are enabled.");
    if (!cfg.s3Bucket) errors.push("S3_BUCKET is required when dependency checks are enabled.");
    if (!cfg.s3SentinelKey) errors.push("S3_SENTINEL_KEY is required when dependency checks are enabled.");
  }
  return errors;
}
