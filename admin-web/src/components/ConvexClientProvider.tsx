'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ConvexReactClient } from 'convex/react';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import type { AuthClient } from '@convex-dev/better-auth/react';
import { authClient } from '@/lib/auth-client';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
const convexClient = convexUrl && convexSiteUrl ? new ConvexReactClient(convexUrl, { expectAuth: true }) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convexClient) {
    return (
      <div className="service-notice" role="alert">
        <p>Set NEXT_PUBLIC_CONVEX_URL and NEXT_PUBLIC_CONVEX_SITE_URL to connect the administrator dashboard.</p>
        {process.env.NODE_ENV === 'development' ? <Link href="/preview">Open the local-only dashboard preview</Link> : null}
      </div>
    );
  }
  return (
      <ConvexBetterAuthProvider client={convexClient} authClient={authClient as unknown as AuthClient}>
      {children}
    </ConvexBetterAuthProvider>
  );
}
