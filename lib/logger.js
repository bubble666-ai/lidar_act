/**
 * Telemetry — Structured Observability Logger
 *
 * Emits NDJSON log records compatible with Vercel Log Drains,
 * Datadog, and OpenTelemetry collectors. Designed for the
 * edge runtime's minimal I/O budget.
 *
 * Log schema follows OpenTelemetry Semantic Conventions
 * for HTTP spans where applicable.
 *
 * @module telemetry
 * @see https://opentelemetry.io/docs/specs/semconv/http/
 */

import { config } from "./config.js";

/** @enum {string} Syslog-aligned severity levels */
const Severity = Object.freeze({
  DEBUG: "DEBUG",
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
});

/**
 * Writes a single structured log record to stdout/stderr.
 *
 * @param {string} severity - Log severity
 * @param {string} event - Machine-readable event name
 * @param {Record<string, unknown>} [attrs={}] - Structured attributes
 */
function record(severity, event, attrs = {}) {
  if (!config.telemetryEnabled) return;
  if (severity === Severity.DEBUG && !config.verboseLogging) return;

  const entry = {
    ts: new Date().toISOString(),
    sev: severity,
    svc: config.serviceName,
    ver: config.serviceVersion,
    evt: event,
    ...attrs,
  };

  const line = JSON.stringify(entry);

  if (severity === Severity.ERROR) {
    console.error(line);
  } else if (severity === Severity.WARN) {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Public telemetry API.
 */
export const telemetry = {
  debug: (evt, a) => record(Severity.DEBUG, evt, a),
  info: (evt, a) => record(Severity.INFO, evt, a),
  warn: (evt, a) => record(Severity.WARN, evt, a),
  error: (evt, a) => record(Severity.ERROR, evt, a),

  /**
   * Records an inbound HTTP request (OpenTelemetry HTTP span start).
   * @param {Request} req
   */
  httpIn(req) {
    try {
      const u = new URL(req.url);
      record(Severity.INFO, "http.request.in", {
        "http.method": req.method,
        "http.target": u.pathname,
        "http.query": u.search || undefined,
        "user_agent.original": req.headers.get("user-agent"),
      });
    } catch {
      record(Severity.INFO, "http.request.in", { "http.method": req.method });
    }
  },

  /**
   * Records an upstream HTTP response (OpenTelemetry HTTP span end).
   * @param {number} status - HTTP status code
   * @param {number} durationMs - Round-trip time in ms
   */
  httpOut(status, durationMs) {
    record(Severity.INFO, "http.response.out", {
      "http.status_code": status,
      "http.duration_ms": durationMs,
    });
  },
};
