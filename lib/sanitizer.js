/**
 * HTTP Header Sanitizer — Transport Layer
 *
 * Prepares outbound headers for the upstream LiDAR processing
 * cluster. Strips hop-by-hop headers (RFC 7230 §6.1), removes
 * platform-injected metadata, and normalizes the client IP
 * chain for geographic coordinate resolution.
 *
 * This ensures clean, spec-compliant requests reach the
 * processing backend regardless of which edge node handled
 * the ingress.
 *
 * @module sanitizer
 * @see https://httpwg.org/specs/rfc7230.html#header.connection
 */

/**
 * Hop-by-hop headers per RFC 7230 §6.1.
 * These MUST NOT be forwarded by intermediaries.
 * @type {Set<string>}
 */
const RFC7230_HOP_BY_HOP = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/**
 * Platform-injected headers added by the edge runtime.
 * Removed to prevent information leakage to upstream.
 * @type {Set<string>}
 */
const PLATFORM_INJECTED = new Set([
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

/** Prefix for all Vercel-specific internal headers */
const EDGE_INTERNAL_PREFIX = "x-vercel-";

/**
 * Produces a sanitized header set suitable for upstream dispatch.
 *
 * Processing steps:
 *   1. Drop RFC 7230 hop-by-hop headers
 *   2. Drop platform-injected headers
 *   3. Drop edge-internal headers (x-vercel-*)
 *   4. Extract and normalize client IP (x-real-ip → x-forwarded-for)
 *
 * @param {Headers} raw - Incoming request headers
 * @returns {{ headers: Headers, clientIp: string|null }}
 */
export function sanitize(raw) {
  const out = new Headers();
  let clientIp = null;

  for (const [key, value] of raw) {
    if (RFC7230_HOP_BY_HOP.has(key)) continue;
    if (PLATFORM_INJECTED.has(key)) continue;
    if (key.startsWith(EDGE_INTERNAL_PREFIX)) continue;

    if (key === "x-real-ip") {
      clientIp = value;
      continue;
    }
    if (key === "x-forwarded-for") {
      if (!clientIp) clientIp = value;
      continue;
    }

    out.set(key, value);
  }

  // Preserve single-hop client IP for upstream geo-resolution
  if (clientIp) {
    out.set("x-forwarded-for", clientIp);
  }

  return { headers: out, clientIp };
}
