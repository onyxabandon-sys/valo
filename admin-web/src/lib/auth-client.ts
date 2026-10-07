'use client';

import { convexClient } from '@convex-dev/better-auth/client/plugins';
import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const ADMIN_TWO_FACTOR_CHALLENGE_KEY = 'valet-admin-two-factor-challenge';
export const ADMIN_TWO_FACTOR_CHALLENGE_EVENT = 'valet-admin-two-factor-required';

function rememberTwoFactorChallenge() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(ADMIN_TWO_FACTOR_CHALLENGE_KEY, 'true');
  window.dispatchEvent(new Event(ADMIN_TWO_FACTOR_CHALLENGE_EVENT));
}

export const authClient = createAuthClient({
  plugins: [convexClient(), twoFactorClient({ onTwoFactorRedirect: rememberTwoFactorChallenge })],
});
