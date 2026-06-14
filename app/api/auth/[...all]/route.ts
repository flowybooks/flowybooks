import { getBetterAuthNextRouteHandlers } from '@/lib/auth/better-auth/next-route-handlers';

async function handler(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', req: Request) {
  const handlers = await getBetterAuthNextRouteHandlers();
  if (!handlers || typeof handlers[method] !== 'function') {
    return new Response('Better Auth is not configured', { status: 501 });
  }
  return handlers[method](req);
}

export const GET = (req: Request) => handler('GET', req);
export const POST = (req: Request) => handler('POST', req);
export const PUT = (req: Request) => handler('PUT', req);
export const PATCH = (req: Request) => handler('PATCH', req);
export const DELETE = (req: Request) => handler('DELETE', req);
