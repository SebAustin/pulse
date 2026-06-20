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
 * Checks (in order):
 *   1. `x-host-token` header
 *   2. `hostToken` query parameter
 * Returns null if not present.
 */
export function extractHostToken(req: Request): string | null {
  const header = req.headers.get("x-host-token");
  if (header) return header;

  const url = new URL(req.url);
  return url.searchParams.get("hostToken");
}
