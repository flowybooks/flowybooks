export const BETTER_AUTH_BASE_PATH = '/api/auth';

export function isBetterAuthConfigured(): boolean {
  return Boolean(process.env.BETTER_AUTH_SECRET);
}

/**
 * Returns the base URL for Better Auth.
 *
 * Priority:
 * 1. BETTER_AUTH_URL - explicit override
 * 2. BASE_URL - fallback
 * 3. localhost - local development default
 */
export function getBetterAuthBaseURL(): string {
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }
  return process.env.BASE_URL || 'http://localhost:3000';
}

export function requireBetterAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'Better Auth is not configured: set BETTER_AUTH_SECRET before enabling Better Auth routes.',
    );
  }
  return secret;
}
