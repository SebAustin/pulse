/**
 * Host session cookie name helper.
 *
 * This module is the ONLY auth module the Edge middleware may import.
 * It intentionally has zero imports — no node:crypto, no config, no
 * external dependencies — so it is safe to run in the Edge runtime.
 *
 * F-01 fix: Edge middleware reads hostToken from the URL, stores it as
 * the raw value in an httpOnly cookie, then 307-redirects to the tokenless
 * path. Subsequent Node.js route handlers and Server Components read the
 * raw cookie and verify it via `verifyToken(rawToken, event.hostTokenHash)`.
 *
 * NFR-03.4 / F-01 / PLAN §1.2.
 */

/**
 * Returns the name of the httpOnly host-session cookie for a given event.
 *
 * Format: `pulse_host_<eventId>`
 *
 * @param eventId - The event the host is authorised for.
 */
export function hostSessionCookieName(eventId: string): string {
  return `pulse_host_${eventId}`;
}
