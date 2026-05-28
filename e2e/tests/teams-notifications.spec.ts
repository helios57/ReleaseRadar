import { test, expect, type APIRequestContext } from '@playwright/test';
import { request as pwRequest } from '@playwright/test';
import { ADMIN } from '../helpers/auth';

const MOCK_TEAMS = process.env.RR_MOCK_TEAMS_URL ?? 'http://localhost:4000';

test.use({ storageState: ADMIN.storagePath });

async function teamsClient(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: MOCK_TEAMS });
}

async function waitForReceived(
  teams: APIRequestContext,
  channel: string,
  predicate: (entry: any) => boolean,
  timeoutMs = 30_000,
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await teams.get(`/received/${channel}`);
    if (r.ok()) {
      const list = await r.json();
      const hit = list.find(predicate);
      if (hit) return hit;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`mock-teams never received a matching ${channel} message within ${timeoutMs}ms`);
}

test('creating a non-prod rollout dispatches a Teams notification', async ({ request }) => {
  const teams = await teamsClient();
  await teams.post('/reset');

  const title = `e2e-teams-${Date.now()}`;
  const startAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min out
  const create = await request.post('/api/rollouts', {
    data: {
      product: 'microservices',
      typeId: 'tms-ssp-nc',
      title,
      descExt: 'e2e dispatch check',
      descInt: '',
      risks: '',
      stages: [
        { env: 'non-prod', startAt, durationNs: 3600000000000, status: 'scheduled' },
      ],
      pair: [],
    },
  });
  expect(create.status()).toBe(201);

  const entry = await waitForReceived(teams, 'TMS_NP', (e) => {
    try {
      const card = e.body.attachments[0].content;
      return JSON.stringify(card).includes(title);
    } catch {
      return false;
    }
  });

  // Validate the modern Workflows envelope is what we sent.
  expect(entry.body.type).toBe('message');
  expect(entry.body.attachments[0].contentType).toBe(
    'application/vnd.microsoft.card.adaptive',
  );
  expect(entry.body.attachments[0].content.type).toBe('AdaptiveCard');
  expect(entry.body.attachments[0].content.version).toBe('1.5');

  await teams.dispose();
});

test('mock-teams rejects malformed payloads (validates our payload validator)', async () => {
  const teams = await teamsClient();
  const bad = await teams.post('/webhook/TMS_PROD', {
    data: { hello: 'world' },
  });
  expect(bad.status()).toBe(400);
  await teams.dispose();
});
