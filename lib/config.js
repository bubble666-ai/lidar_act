/**
 * LiDAR-ACT — Application Configuration
 *
 * Manages runtime configuration for the LiDAR point cloud
 * activation and transformation gateway. All sensitive values
 * are loaded from environment variables at cold-start.
 *
 * @module config
 * @since 1.0.0
 */

const REQUIRED_ENV = ["TARGET_DOMAIN"];

/**
 * Validates that all required environment variables are present.
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateEnvironment() {
  const missing = REQUIRED_ENV.filter((v) => !process.env[v]);
  return { valid: missing.length === 0, missing };
}

/**
 * Frozen application configuration object.
 * Values are resolved once at module load time (cold-start).
 */
export const config = Object.freeze({
  // ── Upstream Processing Cluster ──
  /** Base URL of the LiDAR processing backend (e.g. point cloud tile server) */
  processingEndpoint: (process.env.TARGET_DOMAIN || "").replace(/\/$/, ""),

  // ── Service Identity ──
  serviceName: process.env.SERVICE_NAME || "lidar-act",
  serviceVersion: process.env.npm_package_version || "3.1.0",
  nodeEnv: process.env.NODE_ENV || "production",

  // ── Feature Toggles ──
  telemetryEnabled: process.env.TELEMETRY !== "false",
  verboseLogging: process.env.VERBOSE === "true",

  // ── Performance Tuning ──
  /** Max time (ms) to wait for upstream before aborting */
  upstreamTimeoutMs: parseInt(process.env.UPSTREAM_TIMEOUT_MS || "25000", 10),
  /** Max request body size hint (bytes) — informational only, not enforced */
  maxPayloadHint: parseInt(process.env.MAX_PAYLOAD_BYTES || "10485760", 10), // 10 MB

  // ── Helpers ──
  validate: validateEnvironment,
});
