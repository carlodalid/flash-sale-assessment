import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Config {
  databaseUrl: string;
  redisUrl: string;
  apiPort: number;
  /** Replicas that must acknowledge a purchase before we reply. 0 disables the wait. */
  redisMinReplicaAcks: number;
  redisReplicaAckTimeoutMs: number;
}

const ROOT_ENV_FILE = resolve(import.meta.dirname, '../../../.env');

/** Loads the repository's root `.env` into `process.env`, if present. */
export function loadEnvFile(): void {
  if (existsSync(ROOT_ENV_FILE)) {
    process.loadEnvFile(ROOT_ENV_FILE);
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    redisUrl: required(env, 'REDIS_URL'),
    apiPort: integer(env, 'API_PORT', 3000),
    redisMinReplicaAcks: integer(env, 'REDIS_MIN_REPLICA_ACKS', 0),
    redisReplicaAckTimeoutMs: integer(env, 'REDIS_REPLICA_ACK_TIMEOUT_MS', 50),
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Copy .env.example to .env.`);
  }
  return value;
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative integer, got "${raw}".`);
  }
  return value;
}
