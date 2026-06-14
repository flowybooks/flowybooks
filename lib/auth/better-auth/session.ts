// This helper resolves the current Better Auth session for server code.
// Keep this on the direct Better Auth API path; routing back through the
// app's own Next handler can trip local PGlite/WASM runtime boundaries.

import { headers } from 'next/headers';
import { isAPIError } from 'better-auth/api';
import { isBetterAuthConfigured } from './env';
import { getBetterAuth } from './server';

type BetterAuthInstance = Awaited<ReturnType<typeof getBetterAuth>>;
type BetterAuthSession = Awaited<ReturnType<BetterAuthInstance['api']['getSession']>>;

async function getBetterAuthSessionDirect(): Promise<BetterAuthSession> {
  if (!isBetterAuthConfigured()) {
    return null as BetterAuthSession;
  }

  const auth = await getBetterAuth();
  try {
    return await auth.api.getSession({
      headers: new Headers(await headers()),
      query: { disableRefresh: true },
    });
  } catch (error) {
    if (isAPIError(error) && error.statusCode === 401) {
      return null as BetterAuthSession;
    }
    throw error;
  }
}

/**
 * Fetch the current Better Auth session (read-only).
 * Safe to use alongside existing JWT flow until we cut over.
 */
export async function getBetterAuthSession() {
  return getBetterAuthSessionDirect();
}

/**
 * Require a Better Auth session; throws if missing.
 * Use cautiously while JWT is still the primary auth.
 */
export async function requireBetterAuthSession() {
  const session = await getBetterAuthSession();
  if (!session?.session || !session.user) {
    throw new Error('Better Auth session not found');
  }
  return session;
}
