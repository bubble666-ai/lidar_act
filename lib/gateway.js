/**
 * Upstream Gateway — Point Cloud Pipeline Dispatch
 *
 * Forwards validated requests to the LiDAR processing cluster.
 * Supports full-duplex streaming for large point cloud uploads
 * (.las, .laz, .e57) and tiled delivery of processed datasets.
 *
 * Design notes:
 *   - Uses half-duplex streaming to avoid buffering multi-GB
 *     point cloud payloads in edge worker memory.
 *   - Manual redirect handling preserves signed URLs from the
 *     processing cluster's object storage layer.
 *
 * @module gateway
 */

import { config } from "./config.js";
import { sanitize } from "./sanitizer.js";

/**
 * Resolves the full upstream URL by combining the configured
 * processing endpoint with the path from the incoming request.
 *
 * @param {string} incomingUrl - Full URL of the edge request
 * @returns {string} Absolute URL targeting the upstream cluster
 */
function buildUpstreamUrl(incomingUrl) {
  // Skip past the protocol+host portion (e.g., "https://edge.example.com")
  const pathOffset = incomingUrl.indexOf("/", 8);
  if (pathOffset === -1) {
    return config.processingEndpoint + "/";
  }
  return config.processingEndpoint + incomingUrl.slice(pathOffset);
}

/**
 * Dispatches a request to the upstream LiDAR processing cluster.
 *
 * The response body is passed through as-is (streaming, no buffering)
 * which is critical for point cloud tile delivery where payloads
 * can exceed 100 MB per tile.
 *
 * @param {Request} req - Sanitized edge request
 * @returns {Promise<Response>} Raw upstream response (streamed)
 */
export async function dispatch(req) {
  const targetUrl = buildUpstreamUrl(req.url);
  const { headers } = sanitize(req.headers);

  const method = req.method;
  const streamBody = method !== "GET" && method !== "HEAD";

  return fetch(targetUrl, {
    method,
    headers,
    body: streamBody ? req.body : undefined,
    duplex: "half",
    redirect: "manual",
  });
}
