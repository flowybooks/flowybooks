import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PGLITE_DATA_DIR,
  assertPersistentPGliteDataDir,
  getPGliteDataDir,
  resolvePGliteDataDirPath,
} from './pglite-path';

describe('PGlite data directory configuration', () => {
  it('defaults to a durable local project directory', () => {
    expect(getPGliteDataDir({} as NodeJS.ProcessEnv)).toBe(DEFAULT_PGLITE_DATA_DIR);
    expect(resolvePGliteDataDirPath(DEFAULT_PGLITE_DATA_DIR)).toContain(DEFAULT_PGLITE_DATA_DIR);
  });

  it.each([':memory:', 'memory', 'memory://flowybooks'])(
    'rejects in-memory PGlite storage: %s',
    (dataDir) => {
      expect(() => assertPersistentPGliteDataDir(dataDir)).toThrow(/in-memory/i);
    },
  );

  it.each(['postgres://localhost/books', 'postgresql://localhost/books', 'idb://books'])(
    'rejects non-filesystem URL storage: %s',
    (dataDir) => {
      expect(() => assertPersistentPGliteDataDir(dataDir)).toThrow(/filesystem path/i);
    },
  );
});
