/**
 * Participant cookie signing and verification.
 *
 * Identity binding: a participant joining an event receives an httpOnly cookie
 * `pulse_pt_<eventId>` whose value is `<participantId>.<hmac>`. The HMAC
 * binds the participantId to a specific eventId so a cookie from event A
 * cannot be replayed in event B.
 *
 * The vote/reaction/word handlers derive participantId from this cookie, not
 * from the request body, preventing client-supplied ballot stuffing.
 *
 * Residual risk: a determined attacker who can clear their own cookies and
 * rotate their IP can re-join with a new identity. True Sybil resistance
 * requires account binding — a documented non-goal (A-18, PLAN §1.2).
 *
 * F-02 / SC-identity / NFR-03.4.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config";

const SEPARATOR = ".";

/**
 * Compute HMAC-SHA256 of `eventId:participantId` using the session secret.
 * Returns the digest as a URL-safe base64 string.
 */
function computeHmac(eventId: string, participantId: string): string {
  return createHmac("sha256", config.PULSE_SESSION_SECRET)
    .update(`${eventId}:${participantId}`)
    .digest("base64url");
}

/**
 * Sign a participant identity for a specific event.
 *
 * @param eventId - The event the participant belongs to.
 * @param participantId - The server-issued participant ID (e.g. `u_abc123`).
 * @returns Cookie value: `<participantId>.<hmac>`.
 */
export function signParticipant(eventId: string, participantId: string): string {
  const hmac = computeHmac(eventId, participantId);
  return `${participantId}${SEPARATOR}${hmac}`;
}

/**
 * Verify a cookie value for a specific event.
 *
 * Uses `crypto.timingSafeEqual` to prevent timing-oracle attacks.
 *
 * @param eventId - The event context (must match what was used at sign time).
 * @param cookieValue - Raw cookie value from `pulse_pt_<eventId>` cookie.
 * @returns The participantId if the signature is valid for this event, or
 *          `null` if the cookie is missing, malformed, or forged.
 */
export function verifyParticipant(
  eventId: string,
  cookieValue: string | undefined | null
): string | null {
  if (!cookieValue) return null;

  const separatorIndex = cookieValue.indexOf(SEPARATOR);
  if (separatorIndex === -1) return null;

  const participantId = cookieValue.slice(0, separatorIndex);
  const providedHmac = cookieValue.slice(separatorIndex + 1);

  if (!participantId || !providedHmac) return null;

  const expectedHmac = computeHmac(eventId, participantId);

  // Constant-time comparison — both buffers must be the same length for
  // timingSafeEqual; if lengths differ it is a forgery, return null quickly.
  try {
    const expectedBuf = Buffer.from(expectedHmac, "base64url");
    const providedBuf = Buffer.from(providedHmac, "base64url");

    if (expectedBuf.length !== providedBuf.length) return null;

    const isValid = timingSafeEqual(expectedBuf, providedBuf);
    return isValid ? participantId : null;
  } catch {
    return null;
  }
}

/**
 * Cookie name for a given event's participant identity.
 */
export function participantCookieName(eventId: string): string {
  return `pulse_pt_${eventId}`;
}
