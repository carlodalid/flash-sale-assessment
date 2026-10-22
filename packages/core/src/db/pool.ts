import pg from 'pg';

export type Database = pg.Pool;

export function createDatabase(connectionString: string): Database {
  return new pg.Pool({ connectionString, max: 10 });
}

/** Runs `work` inside a transaction, rolling back if it throws. */
export async function withTransaction<T>(
  db: Database,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
