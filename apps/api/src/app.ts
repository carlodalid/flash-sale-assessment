import express, { type Express } from 'express';
import type { Database, Redis, ReplicaAckOptions } from '@flash-sale/core';
import { errorHandler, notFoundHandler } from './errors';
import { healthRouter } from './routes/health';
import { purchaseRouter } from './routes/purchase';
import { saleRouter } from './routes/sale';

export interface AppDependencies {
  redis: Redis;
  db: Database;
  replicaAcks: ReplicaAckOptions;
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1kb' }));

  app.use('/api', saleRouter(dependencies), purchaseRouter(dependencies));
  app.use(healthRouter(dependencies));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
