import { createAuthClient } from 'better-auth/react';

/**
 * Client-side Better Auth instance.
 *
 * Prefer the current browser origin so local dev ports and previews
 * keep working even if NEXT_PUBLIC_BETTER_AUTH_URL is stale.
 */
const envBaseURL = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || '';
const browserOrigin =
  typeof window !== 'undefined' && window.location.origin !== 'null' ? window.location.origin : '';
const baseURL = typeof window === 'undefined' ? envBaseURL : browserOrigin || envBaseURL;

export const authClient = createAuthClient({
  baseURL,
});
