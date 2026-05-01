/**
 * LiDAR-ACT — Edge Gateway Handler
 *
 * Entry point for the LiDAR Activation & Cloud Transform service.
 * Deployed as a Vercel Edge Function, this handler serves two roles:
 *
 *   1. Management plane — exposes /health, /healthz, /metrics, and
 *      a root discovery endpoint for service-mesh integration.
 *
 *   2. Data plane — proxies all other requests to the upstream
 *      LiDAR processing cluster, streaming point cloud payloads
 *      (LAS 1.4, LAZ, E57, PLY) without edge-side buffering.
 *
 * Architectural invariant:
 *   The edge layer NEVER inspects or transforms point cloud data.
 *   It is a transparent, low-latency conduit between field sensors
 *   (or client applications) and the processing backend.
 *
 * @module handler
 * @version 3.1.0
 */

import { config } from "../lib/config.js";
import { dispatch } from "../lib/gateway.js";
import { telemetry } from "../lib/logger.js";
import { ok, fail } from "../lib/responses.js";

export const runtime = "edge";

/* ════════════════════ Management Plane ════════════════════ */

/**
 * GET / — Service discovery document (RFC 8631 WebFinger-like).
 * Returns service identity and available endpoint catalogue.
 */
function handleDiscovery() {
  return ok({
    service: config.serviceName,
    version: config.serviceVersion,
    description:
      "LiDAR point cloud activation, transformation, and tiled distribution gateway",
    environment: config.nodeEnv,
    links: {
      health: { href: "/health", method: "GET", title: "Liveness probe" },
      metrics: { href: "/metrics", method: "GET", title: "Prometheus metrics" },
      ingest: {
        href: "/v1/ingest/{dataset}",
        method: "POST",
        title: "Upload raw point cloud",
        templated: true,
      },
      tiles: {
        href: "/v1/tiles/{z}/{x}/{y}.laz",
        method: "GET",
        title: "Fetch processed 3D tile",
        templated: true,
      },
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /health — Kubernetes-style liveness probe.
 * Returns 200 if the edge function is responsive and the
 * upstream processing endpoint is configured.
 */
function handleHealth() {
  const envCheck = config.validate();
  const healthy = envCheck.valid;

  return ok({
    status: healthy ? "healthy" : "degraded",
    service: config.serviceName,
    version: config.serviceVersion,
    region: process.env.VERCEL_REGION || "unknown",
    upstream: {
      configured: !!config.processingEndpoint,
      endpoint: config.processingEndpoint
        ? config.processingEndpoint.replace(/https?:\/\//, "***.")
        : null,
    },
    checks: {
      environment: envCheck.valid ? "pass" : "fail",
      missingVars: envCheck.missing.length > 0 ? envCheck.missing : undefined,
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /metrics — Prometheus exposition format (text/plain 0.0.4).
 * Exposes basic service metadata and upstream status gauges.
 */
function handleMetrics() {
  const ts = Date.now();
  const lines = [
    "# HELP lidar_act_info Service build metadata",
    "# TYPE lidar_act_info gauge",
    `lidar_act_info{version="${config.serviceVersion}",env="${config.nodeEnv}"} 1`,
    "",
    "# HELP lidar_act_upstream_configured Whether upstream endpoint is set",
    "# TYPE lidar_act_upstream_configured gauge",
    `lidar_act_upstream_configured ${config.processingEndpoint ? 1 : 0}`,
    "",
    "# HELP lidar_act_edge_timestamp_seconds Current edge timestamp",
    "# TYPE lidar_act_edge_timestamp_seconds gauge",
    `lidar_act_edge_timestamp_seconds ${Math.floor(ts / 1000)}`,
  ];

  return new Response(lines.join("\n") + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/* ════════════════════ Request Router ════════════════════ */

/** Management routes handled at the edge (never forwarded) */
const MANAGEMENT_ROUTES = new Map([
  ["/health", handleHealth],
  ["/healthz", handleHealth],
  ["/readyz", handleHealth],
  ["/metrics", handleMetrics],
]);

/**
 * Extracts pathname from a full URL string without constructing
 * a URL object (avoids allocation overhead in hot path).
 *
 * @param {string} url
 * @returns {string} Pathname portion (e.g. "/v1/tiles/12/3/4.laz")
 */
function fastPathname(url) {
  const i = url.indexOf("/", 8); // skip "https://"
  if (i === -1) return "/";
  const q = url.indexOf("?", i);
  return q === -1 ? url.slice(i) : url.slice(i, q);
}

/* ════════════════════ Edge Entry Point ════════════════════ */

/**
 * Primary edge handler. Routes management requests locally;
 * all data-plane requests are dispatched to the upstream
 * LiDAR processing cluster.
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
export default async function handler(req) {
  const t0 = Date.now();
  const path = fastPathname(req.url);

  telemetry.httpIn(req);

  // ── Management plane (local) ──
  if (req.method === "GET") {
    if (path === "/") return handleDiscovery();
    const mgmt = MANAGEMENT_ROUTES.get(path);
    if (mgmt) return mgmt();
  }

  // ── Data plane (upstream) ──
  if (!config.processingEndpoint) {
    telemetry.error("upstream.not_configured", {
      hint: "Set TARGET_DOMAIN to point at the LiDAR processing cluster",
    });
    return fail(
      "Service Unavailable",
      503,
      "UPSTREAM_NOT_CONFIGURED",
      "The upstream LiDAR processing endpoint has not been configured. " +
        "Set the TARGET_DOMAIN environment variable and redeploy."
    );
  }

  try {
    const res = await dispatch(req);
    telemetry.httpOut(res.status, Date.now() - t0);
    return res;
  } catch (err) {
    telemetry.error("upstream.dispatch_failed", {
      error: err.message,
      duration_ms: Date.now() - t0,
      path,
    });
    return fail(
      "Bad Gateway",
      502,
      "UPSTREAM_UNREACHABLE",
      "The LiDAR processing cluster did not respond. " +
        "Verify TARGET_DOMAIN and upstream availability."
    );
  }
}