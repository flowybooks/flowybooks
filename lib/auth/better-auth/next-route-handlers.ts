import { isBetterAuthConfigured } from './env';
import { getBetterAuth } from './server';

export async function getBetterAuthNextRouteHandlers() {
  if (!isBetterAuthConfigured()) {
    return null;
  }

  const auth = await getBetterAuth();
  const { toNextJsHandler } = await import('better-auth/next-js');
  return toNextJsHandler(auth);
}

export async function requireBetterAuthNextRouteHandlers() {
  const handlers = await getBetterAuthNextRouteHandlers();
  if (!handlers) {
    throw new Error('Better Auth is not configured. Set BETTER_AUTH_SECRET.');
  }
  return handlers;
}
