import type { ChainableCommander } from 'ioredis';

/**
 * Executes a MULTI block and surfaces the first per-command error. Plain
 * `exec()` resolves even when an individual command inside it failed.
 */
export async function execTransaction(transaction: ChainableCommander): Promise<unknown[]> {
  const results = await transaction.exec();
  if (results === null) {
    throw new Error('Redis transaction was aborted.');
  }

  return results.map(([error, value]) => {
    if (error) throw error;
    return value;
  });
}
