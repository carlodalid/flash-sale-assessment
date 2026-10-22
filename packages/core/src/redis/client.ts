import { Redis } from 'ioredis';

export type { Redis };

export function createRedis(url: string): Redis {
  return new Redis(url, {
    // Fail fast instead of queueing commands forever while Redis is unreachable;
    // the API turns the error into a 500 and the worker retries its loop.
    maxRetriesPerRequest: 3,
  });
}
