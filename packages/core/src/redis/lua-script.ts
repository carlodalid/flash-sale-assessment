import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Redis } from 'ioredis';

const SCRIPTS_DIR = join(import.meta.dirname, 'scripts');

/**
 * A Lua script that runs atomically inside Redis. It is sent once and then
 * invoked by its SHA1 (EVALSHA), falling back to EVAL if Redis has forgotten it,
 * e.g. after a restart.
 */
export class LuaScript {
  private readonly sha: string;

  private constructor(private readonly source: string) {
    this.sha = createHash('sha1').update(source).digest('hex');
  }

  static load(fileName: string): LuaScript {
    return new LuaScript(readFileSync(join(SCRIPTS_DIR, fileName), 'utf8'));
  }

  async run(redis: Redis, keys: string[], args: Array<string | number>): Promise<unknown> {
    try {
      return await redis.evalsha(this.sha, keys.length, ...keys, ...args);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('NOSCRIPT')) {
        return redis.eval(this.source, keys.length, ...keys, ...args);
      }
      throw error;
    }
  }
}
