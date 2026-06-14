import { assertPersistentPGliteDataDir, getPGliteDataDir } from './db/pglite-path';

type EnvLike = Record<string, string | undefined>;

function fail(message: string): never {
  throw new Error(`[env-guard] ${message}`);
}

function parseRequiredUrl(value: string | undefined, varName: string): URL {
  if (!value) {
    fail(`${varName} is not set`);
  }
  try {
    return new URL(value);
  } catch {
    fail(`${varName} is not a valid URL`);
  }
}

export function assertDatabaseEnv(env: EnvLike = process.env): void {
  try {
    assertPersistentPGliteDataDir(getPGliteDataDir(env as NodeJS.ProcessEnv));
  } catch (error) {
    fail(error instanceof Error ? error.message : 'PGLITE_DATA_DIR is invalid');
  }
}

export function assertAppUrlEnv(env: EnvLike = process.env): void {
  const baseHost = parseRequiredUrl(env.BASE_URL, 'BASE_URL').hostname.toLowerCase();
  const betterAuthHost = parseRequiredUrl(
    env.BETTER_AUTH_URL,
    'BETTER_AUTH_URL',
  ).hostname.toLowerCase();
  const nextPublicBetterAuthHost = parseRequiredUrl(
    env.NEXT_PUBLIC_BETTER_AUTH_URL,
    'NEXT_PUBLIC_BETTER_AUTH_URL',
  ).hostname.toLowerCase();

  if (baseHost !== betterAuthHost || baseHost !== nextPublicBetterAuthHost) {
    fail('BASE_URL, BETTER_AUTH_URL, and NEXT_PUBLIC_BETTER_AUTH_URL must use the same host');
  }
}

export function assertRuntimeEnv(env: EnvLike = process.env): void {
  assertDatabaseEnv(env);
  assertAppUrlEnv(env);
}
