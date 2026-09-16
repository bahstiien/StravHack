import assert from 'node:assert/strict';
import test from 'node:test';

import { requestCorosSync, shouldReloadAfterSync } from '../src/data/sync-api.js';

test('une réponse HTTP en erreur produit un diagnostic visible', async () => {
  const fetcher = async () => ({ ok: false, status: 404, json: async () => ({}) });

  const result = await requestCorosSync(fetcher);

  assert.deepEqual(result, {
    ok: false,
    mode: 'error',
    error: 'Synchronisation indisponible (HTTP 404).',
  });
});

test('une réponse de synchronisation valide est conservée', async () => {
  const expected = { ok: true, mode: 'live', message: '2 activités récupérées.', snapshot: { activities: [{ id: 'new' }] } };
  const fetcher = async () => ({ ok: true, status: 200, json: async () => expected });

  assert.deepEqual(await requestCorosSync(fetcher), expected);
});

test('une reconstruction utile est rechargée même si Coros était injoignable', () => {
  assert.equal(shouldReloadAfterSync({ ok: false, mode: 'rebuild', activityCount: 2 }), true);
  assert.equal(shouldReloadAfterSync({ ok: false, mode: 'error' }), false);
});
