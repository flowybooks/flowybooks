import { drizzle } from 'drizzle-orm/pglite';
import * as schema from './schema';
import { config } from 'dotenv';
import { assertDatabaseEnv } from '../env-guard';
import { getPGliteClient } from './pglite';

config({ path: '.env.local' });
config({ path: '.env' });

assertDatabaseEnv();

function createDb() {
  return drizzle({ client: getPGliteClient(), schema });
}

type DbClient = ReturnType<typeof createDb>;

let dbClient: DbClient | null = null;

function getDbClient(): DbClient {
  dbClient ??= createDb();
  return dbClient;
}

export const db = new Proxy({} as DbClient, {
  get(_target, property, receiver) {
    const client = getDbClient();
    const value = Reflect.get(client, property, receiver);

    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as DbClient;
