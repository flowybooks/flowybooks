import path from 'node:path';

export const DEFAULT_PGLITE_DATA_DIR = '.pglite/flowybooks';

const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

export function assertPersistentPGliteDataDir(dataDir: string): void {
  const trimmed = dataDir.trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed) {
    throw new Error('PGLITE_DATA_DIR must point at a local filesystem directory');
  }

  if (lower === ':memory:' || lower === 'memory' || lower.startsWith('memory://')) {
    throw new Error(
      'PGLITE_DATA_DIR cannot use in-memory storage; books must be stored in a durable local filesystem directory',
    );
  }

  if (URL_SCHEME_PATTERN.test(trimmed)) {
    throw new Error('PGLITE_DATA_DIR must be a local filesystem path, not a URL');
  }
}

export function getPGliteDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const dataDir = env.PGLITE_DATA_DIR?.trim() || DEFAULT_PGLITE_DATA_DIR;
  assertPersistentPGliteDataDir(dataDir);
  return dataDir;
}

export function resolvePGliteDataDirPath(dataDir = getPGliteDataDir()): string {
  assertPersistentPGliteDataDir(dataDir);
  return path.isAbsolute(dataDir)
    ? dataDir
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), dataDir);
}
