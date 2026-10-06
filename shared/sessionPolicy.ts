export const SESSION_MAX_AGE_MS = 12 * 60 * 60_000;
export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1_000;

export function getSessionExpiresAt(loggedInAt: number) {
  if (!Number.isSafeInteger(loggedInAt)) throw new RangeError('INVALID_SESSION_TIME');
  return loggedInAt + SESSION_MAX_AGE_MS;
}

export function isSessionExpired(expiresAt: number, now: number) {
  return !Number.isSafeInteger(expiresAt) || !Number.isSafeInteger(now) || expiresAt <= now;
}
