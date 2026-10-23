import type { AddressInfo } from 'node:net';
import type { TestContext } from '@flash-sale/core/testing';
import { createApp } from '../src/app';

export interface TestServer {
  /** Base URL of the running app, e.g. `http://127.0.0.1:54321`. */
  url: string;
  close(): Promise<void>;
}

/** Serves the real app over HTTP on a free port, backed by the test database and Redis. */
export function startTestServer({ db, redis }: TestContext): Promise<TestServer> {
  const app = createApp({ db, redis, replicaAcks: { minReplicaAcks: 0, timeoutMs: 0 } });

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
