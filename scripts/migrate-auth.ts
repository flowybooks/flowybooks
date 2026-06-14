import { config } from 'dotenv';

import { runBetterAuthMigrations } from '../lib/auth/better-auth/migrations';
import { closePGliteClient } from '../lib/db/pglite';

config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error(
      'BETTER_AUTH_SECRET is missing. Run `bun run db:setup` before migrating auth tables.',
    );
  }

  await runBetterAuthMigrations();
  console.log('Better Auth migrations applied.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closePGliteClient());
