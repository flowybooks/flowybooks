// Better Auth's optional SQLite dialects still import these deprecated
// migration exports from Kysely's root module while Kysely 0.29 exposes them
// from kysely/migration at runtime.
export * from '../../node_modules/kysely/dist/index.js';
export {
  DEFAULT_ALLOW_UNORDERED_MIGRATIONS,
  DEFAULT_MIGRATION_LOCK_TABLE,
  DEFAULT_MIGRATION_TABLE,
  MIGRATION_LOCK_ID,
  Migrator,
  NO_MIGRATIONS,
} from '../../node_modules/kysely/dist/migration/migrator.js';
export { FileMigrationProvider } from '../../node_modules/kysely/dist/migration/file-migration-provider.js';
