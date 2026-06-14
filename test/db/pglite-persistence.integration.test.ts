import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let tempRoot: string | null = null;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  }
});

describe('PGlite persistence', () => {
  it('keeps ledger data after closing and reopening the local database', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'flowybooks-pglite-'));
    const dataDir = path.join(tempRoot, 'ledger');

    let client = new PGlite(dataDir);
    await client.query(`
      create table ledger_durability_check (
        id text primary key,
        description text not null,
        amount_cents integer not null
      )
    `);
    await client.query(
      'insert into ledger_durability_check (id, description, amount_cents) values ($1, $2, $3)',
      ['je-001', 'Posted journal entry survives restart', 12500],
    );

    await client.close();

    client = new PGlite(dataDir);
    const result = await client.query(
      'select description, amount_cents from ledger_durability_check where id = $1',
      ['je-001'],
    );
    await client.close();

    await expect(stat(path.join(dataDir, 'PG_VERSION'))).resolves.toBeTruthy();
    expect(result.rows).toEqual([
      {
        description: 'Posted journal entry survives restart',
        amount_cents: 12500,
      },
    ]);
  });
});
