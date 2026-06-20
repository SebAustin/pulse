/**
 * Host token generation, hashing, and verification.
 *
 * Tokens are 128-bit URL-safe random values (22 characters of base64url).
 * Only the SHA-256 hash is stored in DynamoDB; the raw token lives only in
 * the host URL and is never persisted.
 *
 * NFR-03.3: minimum 128-bit entropy.
 * NFR-03.4: verified on every privileged mutation and read.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Generate a new host token.
 * Returns a URL-safe base64 string (~22 chars for 16 bytes).
 */
export function generateHostToken(): string {
  return randomBytes(16)
    .toString("base64url")
    .replace(/[^A-Za-z0-9_-]/g, "");
}

/**
 * Hash a raw token with SHA-256.
 * Stored in the EVENT item as `hostTokenHash`.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison of a raw token against a stored hash.
 * Returns true only when they match.
 */
export function verifyToken(rawToken: string, storedHash: string): boolean {
  const candidate = hashToken(rawToken);
  // Constant-time compare to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(candidate, "hex"),
      Buffer.from(storedHash, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Extract the host token from an incoming request.
 *
 * For GET /ops and GET /summary the token MUST arrive via the
 * `x-pulse-host-token` request header (or the legacy alias `x-host-token`).
 * Query-param transport is accepted only for POST bodies (close-event,
 * launch/close-moment) where the token travels in the JSON body — those
 * routes never call this helper for query params.
 *
 * Why a header and not a query param?
 *   - Query params appear in server/CDN/proxy access logs, browser history,
 *     analytics beacons, and the HTTP Referer header sent to any third-party
 *     resource loaded on the page.
 *   - A request header is not logged by default and is stripped before
 *     forwarding by well-behaved CDNs unless explicitly allow-listed.
 *
 * Trade-off for the capability URL (/host/[eventId]/[hostToken]):
 *   The host token is still part of the page PATH for the initial console
 *   load — this is the "capability URL" pattern (unguessable link = auth).
 *   We accept that risk for the page URL itself but avoid amplifying it by
 *   broadcasting the token in subsequent XHR query strings.  The /host/*
 *   routes also set Referrer-Policy: no-referrer so the path cannot leak
 *   through the Referer header to any third-party resource.
 *
 * Checks (in order):
 *   1. `x-pulse-host-token` header  (preferred, new canonical name)
 *   2. `x-host-token` header        (legacy alias — kept for backwards compat)
 *
 * Returns null if not present.
 */
export function extractHostToken(req: Request): string | null {
  return (
    req.headers.get("x-pulse-host-token") ??
    req.headers.get("x-host-token")
  );
}
