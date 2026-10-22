// A flash-sale burst: many distinct buyers plus repeat clicks from some of them,
// all arriving within a few seconds. Run via `pnpm stress`, which resets the sale
// first and verifies the end state afterwards.
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:3000';
const UNIQUE_USERS = Number(__ENV.UNIQUE_USERS || 5000);
const REPEAT_REQUESTS = Number(__ENV.REPEAT_REQUESTS || 1000);

export const options = {
  scenarios: {
    burst: {
      executor: 'shared-iterations',
      vus: 200,
      iterations: UNIQUE_USERS + REPEAT_REQUESTS,
      maxDuration: '1m',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    http_req_duration: ['p(95)<500'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// 409 and 410 are correct answers during a flash sale, not failures.
http.setResponseCallback(http.expectedStatuses(202, 409, 410));

const outcomeCounters = {
  202: new Counter('purchase_accepted'),
  409: new Counter('purchase_already_purchased'),
  410: new Counter('purchase_sold_out'),
};

export default function () {
  // Iterations beyond UNIQUE_USERS wrap around and replay earlier buyers.
  const userId = `stress-user-${exec.scenario.iterationInTest % UNIQUE_USERS}`;

  const response = http.post(`${BASE_URL}/api/purchase`, JSON.stringify({ userId }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(response, {
    'status is 202, 409 or 410': (r) => r.status === 202 || r.status === 409 || r.status === 410,
  });
  outcomeCounters[response.status]?.add(1);
}
