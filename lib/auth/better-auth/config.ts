import { nextCookies } from 'better-auth/next-js';
import type { BetterAuthOptions } from 'better-auth';
import { BETTER_AUTH_BASE_PATH, getBetterAuthBaseURL, requireBetterAuthSecret } from './env';
import { createKyselyForBetterAuth } from './kysely';

function parseCsvEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Central place to build Better Auth options so upgrades/tweaks
 * stay in one file.
 *
 * This sets up the Kysely adapter against the same PGlite database
 * the app already uses.
 */
export function buildBetterAuthConfig(): BetterAuthOptions {
  const secret = requireBetterAuthSecret();
  const { kysely } = createKyselyForBetterAuth();

  const baseUrl = getBetterAuthBaseURL();
  const extraTrustedOrigins = parseCsvEnv('BETTER_AUTH_TRUSTED_ORIGINS');
  const publicAuthUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
  const devTrustedOrigins =
    process.env.NODE_ENV === 'production' ? [] : ['http://localhost:*', 'http://127.0.0.1:*'];
  const trustedOrigins = Array.from(
    new Set(
      [
        baseUrl,
        process.env.BASE_URL,
        process.env.BETTER_AUTH_URL,
        publicAuthUrl,
        'http://localhost:3000',
      ]
        .concat(extraTrustedOrigins)
        .concat(devTrustedOrigins)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  );

  return {
    secret,
    baseURL: getBetterAuthBaseURL(),
    basePath: BETTER_AUTH_BASE_PATH,
    session: {
      expiresIn: 60 * 60 * 24,
    },
    trustedOrigins,
    telemetry: {
      enabled: false,
    },
    plugins: [nextCookies()],
    database: {
      db: kysely,
      type: 'postgres',
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      autoSignIn: true,
      async sendResetPassword({ user, url }) {
        console.info(`[flowybooks] Password reset link for ${user.email}: ${url}`);
      },
    },
    user: {
      deleteUser: {
        enabled: true,
      },
    },
    // NOTE: Organization plugin and migrations will be enabled in later slices.
  };
}
