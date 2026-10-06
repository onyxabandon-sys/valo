import { ConvexReactClient } from 'convex/react';
import { CONVEX_URL } from '@env';

export const convexClient = CONVEX_URL ? new ConvexReactClient(CONVEX_URL, { expectAuth: true }) : null;
