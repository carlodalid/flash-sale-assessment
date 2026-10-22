import { createDatabase, loadConfig, loadEnvFile, runMigrations } from '@flash-sale/core';

loadEnvFile();
const db = createDatabase(loadConfig().databaseUrl);

try {
  const applied = await runMigrations(db);
  console.log(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
} finally {
  await db.end();
}
