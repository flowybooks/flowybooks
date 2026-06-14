import { getMigrations } from 'better-auth/db/migration';
import { buildBetterAuthConfig } from './config';

/**
 * Helper to run/compile Better Auth migrations using the current config.
 * Use this against a backed-up local database first.
 */
export async function getBetterAuthMigrations() {
  const config = buildBetterAuthConfig();
  return getMigrations(config);
}

export async function compileBetterAuthMigrationSQL() {
  const migrations = await getBetterAuthMigrations();
  return migrations.compileMigrations();
}

export async function runBetterAuthMigrations() {
  const migrations = await getBetterAuthMigrations();
  await migrations.runMigrations();
}
