import pg from 'pg';

/**
 * True when Postgres rejected the statement itself: SQLSTATE class 22 (data
 * exception) or 23 (integrity constraint violation). Retrying gives the same
 * answer, and nothing was written.
 *
 * Anything else (a lost connection, a timeout, a server restart) may succeed
 * on retry, and may even have committed already without us hearing back.
 */
export function isPermanentDatabaseError(error: unknown): boolean {
  return error instanceof pg.DatabaseError && /^2[23]/.test(error.code ?? '');
}
