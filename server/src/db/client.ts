import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { schema } from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;

/** The transaction handle Drizzle hands to `db.transaction(cb)`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Accepted by repository functions that must work both standalone and inside a
 * transaction. Widen a repo function's first parameter to this when it may be
 * composed into a `db.transaction(...)` block.
 */
export type DbOrTx = Db | Tx;

export interface DbHandle {
  db: Db;
  sql: postgres.Sql;
  close: () => Promise<void>;
}

/**
 * Create a Drizzle client over postgres-js. Used by the app (one shared handle)
 * and by the Testcontainers harness (per-test handle).
 */
export function createDb(databaseUrl: string, opts?: { max?: number }): DbHandle {
  const sql = postgres(databaseUrl, { max: opts?.max ?? 10 });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
