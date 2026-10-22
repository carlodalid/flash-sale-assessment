import { createDatabase } from '../src/db/pool';
import { runMigrations } from '../src/db/migrate';
import { TEST_DATABASE_URL } from './test-context';

export default async function migrateTestDatabase() {
  const db = createDatabase(TEST_DATABASE_URL);
  try {
    await runMigrations(db);
  } catch (error) {
    throw new Error(
      `Could not prepare the test database at ${TEST_DATABASE_URL}. Is \`pnpm infra:up\` running?\n${error}`,
    );
  } finally {
    await db.end();
  }
}
