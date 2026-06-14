import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function runMigrate(dataDir: string, label: string) {
  const result = spawnSync('bun', ['run', 'db:migrate'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ??
        'migration-check-only-secret-that-is-not-used-outside-temp-databases',
      PGLITE_DATA_DIR: dataDir,
    },
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    console.error(`Migration check failed during ${label}.`);
    if (result.stdout) console.error(result.stdout);
    if (result.stderr) console.error(result.stderr);
    process.exit(result.status ?? 1);
  }
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'flowybooks-migration-check-'));
const dataDir = path.join(tempRoot, 'pglite-data');

try {
  runMigrate(dataDir, 'fresh database migration');
  runMigrate(dataDir, 'existing database migration');
  console.log('Migration check passed.');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
