import { Kysely, PGliteDialect } from 'kysely';
import { getPGliteClient } from '@/lib/db/pglite';

/**
 * Creates a shared Kysely instance using the embedded PGlite database.
 * This is used only by Better Auth (Drizzle uses the same PGlite client).
 */
export function createKyselyForBetterAuth() {
  const dialect = new PGliteDialect({
    pglite: getPGliteClient(),
  });
  const kysely = new Kysely<unknown>({ dialect });

  return { kysely };
}
