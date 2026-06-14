import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../../lib/db/schema';

const integrationDataDir = path.resolve(process.cwd(), '.pglite/test-integration');

export default async function setupIntegrationDatabase() {
  await rm(integrationDataDir, { recursive: true, force: true });
  await mkdir(integrationDataDir, { recursive: true });

  const client = new PGlite(integrationDataDir);
  const db = drizzle({ client, schema });

  try {
    await migrate(db, {
      migrationsFolder: path.resolve(process.cwd(), 'lib/db/migrations'),
    });
  } finally {
    await client.close();
  }

  return async () => {
    await rm(integrationDataDir, { recursive: true, force: true });
  };
}
