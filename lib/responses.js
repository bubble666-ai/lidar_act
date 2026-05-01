/**
 * Standardized API Responses
 *
 * All management endpoints return responses conforming to
 * the JSON:API error/meta specification subset used across
 * the LiDAR-ACT service mesh.
 *
 * @module responses
 * @see https://jsonapi.org/format/#errors
 */

const JSON_TYPE = "application/json; charset=utf-8";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

/**
 * Success response envelope.
 *
 * @param {unknown} data - Payload
 * @param {number} [status=200]
 * @returns {Response}
 */
export function ok(data, status = 200) {
  return new Response(
    JSON.stringify({ meta: { status: "ok" }, data }),
    {
      status,
      headers: {
        "Content-Type": JSON_TYPE,
        "Cache-Control": "no-store, must-revalidate",
        ...SECURITY_HEADERS,
      },
    }
  );
}

/**
 * Error response envelope.
 *
 * @param {string} title - Short error summary
 * @param {number} [status=500]
 * @param {string} [code] - Machine-readable error code
 * @param {string} [detail] - Extended description
 * @returns {Response}
 */
export function fail(title, status = 500, code, detail) {
  const error = { title, status };
  if (code) error.code = code;
  if (detail) error.detail = detail;
  return new Response(
    JSON.stringify({ errors: [error] }),
    {
      status,
      headers: {
        "Content-Type": JSON_TYPE,
        "Cache-Control": "no-store",
        ...SECURITY_HEADERS,
      },
    }
  );
}
