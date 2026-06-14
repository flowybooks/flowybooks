import { PGlite } from '@electric-sql/pglite';
import { mkdirSync } from 'node:fs';
import { getPGliteDataDir, resolvePGliteDataDirPath } from './pglite-path';

let pgliteClient: PGlite | null = null;

function ensurePGliteDataDir(dataDir: string): void {
  mkdirSync(resolvePGliteDataDirPath(dataDir), { recursive: true });
}

export function getPGliteClient(): PGlite {
  if (pgliteClient) {
    return pgliteClient;
  }

  const dataDir = getPGliteDataDir();
  ensurePGliteDataDir(dataDir);
  pgliteClient = new PGlite(resolvePGliteDataDirPath(dataDir));

  return pgliteClient;
}

export async function closePGliteClient(): Promise<void> {
  if (!pgliteClient) {
    return;
  }

  await pgliteClient.close();
  pgliteClient = null;
}
