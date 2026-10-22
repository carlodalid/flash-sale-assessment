import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { withTransaction, type Database } from './pool';

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../migrations');

/** Arbitrary constant so concurrent starters (API + script) don't migrate at the same time. */
const MIGRATION_LOCK_ID = 727_001;

/**
 * Applies every `migrations/*.sql` file that hasn't run yet, in filename order.
 * Each file runs in its own transaction together with its bookkeeping row.
 */
export async function runMigrations(db: Database): Promise<string[]> {
  return withTransaction(db, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.name));

    const pending = (await readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith('.sql') && !applied.has(file))
      .sort();

    for (const file of pending) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    }

    return pending;
  });
}
