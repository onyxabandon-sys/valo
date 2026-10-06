import { convexBetterAuthNextJs } from '@convex-dev/better-auth/nextjs';

function getAuthHandler() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!convexUrl || !convexSiteUrl) return null;
  return convexBetterAuthNextJs({ convexUrl, convexSiteUrl }).handler;
}

export async function dispatchAuth(request: Request) {
  const handlers = getAuthHandler();
  if (!handlers) {
    return Response.json({ error: 'Convex authentication is not configured.' }, { status: 503 });
  }
  if (request.method === 'GET') return await handlers.GET(request);
  if (request.method === 'POST') return await handlers.POST(request);
  return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST' } });
}
