import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';
import { resolvePGliteDataDirPath } from './lib/db/pglite-path';

const pgliteDataDir = resolvePGliteDataDirPath();
mkdirSync(pgliteDataDir, { recursive: true });

export default defineConfig({
  schema: './lib/db/schema/index.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  driver: 'pglite',
  dbCredentials: {
    url: pgliteDataDir,
  },
  strict: true,
  verbose: true,
});
