/**
 * Host token generation, hashing, and verification.
 *
 * Tokens are 128-bit URL-safe random values (22 characters of base64url).
 * Only the SHA-256 hash is stored in DynamoDB; the raw token lives only in
 * the httpOnly cookie `pulse_host_<eventId>` after the first capability-URL
 * redemption and is never persisted elsewhere.
 *
 * NFR-03.3: minimum 128-bit entropy.
 * NFR-03.4: verified on every privileged mutation and read.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hostSessionCookieName } from "./hostCookie";

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
 * Checks (in order):
 *   1. `x-pulse-host-token` header  (preferred, new canonical name)
 *   2. `x-host-token` header        (legacy alias — kept for backwards compat)
 *
 * For cookie-based host session auth (F-01 / post-redemption), use
 * `extractHostTokenFromCookie(req, eventId)` instead.
 *
 * Returns null if not present.
 */
export function extractHostToken(req: Request): string | null {
  return (
    req.headers.get("x-pulse-host-token") ??
    req.headers.get("x-host-token")
  );
}

/**
 * Extract the host token from the httpOnly session cookie set by Edge
 * middleware during capability-URL redemption (F-01 fix).
 *
 * Reads `pulse_host_<eventId>` from the Cookie header and returns the raw
 * hostToken value stored there — or null if absent/empty.
 *
 * There is no HMAC to verify here: the cookie stores the raw token as-is,
 * and authorization happens separately via `verifyToken(rawToken, event.hostTokenHash)`.
 * The httpOnly + SameSite=Strict cookie attributes prevent XSS exfiltration
 * and CSRF, making the raw-value cookie safe for this purpose.
 *
 * Used in Node.js Route Handlers and Server Components.
 * Not for use in Edge middleware (no node:crypto there).
 *
 * @param req     - The incoming Next.js request.
 * @param eventId - The event context; used to form the cookie name so
 *                  a cookie from event A cannot be used for event B.
 */
export function extractHostTokenFromCookie(
  req: Request,
  eventId: string
): string | null {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookieName = hostSessionCookieName(eventId);

  // Parse the cookie header for the specific cookie name.
  const match = cookieHeader
    .split(";")
    .find((c) => c.trim().startsWith(`${cookieName}=`));
  if (!match) return null;

  const value = match.trim().slice(cookieName.length + 1).trim();
  return value || null;
}
