import { createHmac } from "crypto";

function getSecret(): string {
  return process.env.AUTH_SECRET || "fallback-secret-key";
}

/**
 * Generate a guest management token for a booking.
 * This allows the guest to cancel or reschedule without authentication.
 */
export function generateGuestToken(
  bookingId: string,
  guestEmail: string
): string {
  const hmac = createHmac("sha256", getSecret());
  hmac.update(`${bookingId}:${guestEmail}`);
  return hmac.digest("hex").slice(0, 32);
}

/**
 * Verify a guest management token.
 */
export function verifyGuestToken(
  bookingId: string,
  guestEmail: string,
  token: string
): boolean {
  const expected = generateGuestToken(bookingId, guestEmail);
  return token === expected;
}
