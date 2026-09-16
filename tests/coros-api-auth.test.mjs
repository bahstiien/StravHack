import assert from 'node:assert/strict';
import test from 'node:test';

import { apiAuthSettings, authorizeApiRequest } from '../server/auth.js';
import { authenticatedFetch, setApiAccessToken } from '../src/data/api-client.js';

test('Vercel exige automatiquement une session Supabase pour le pont Coros', () => {
  const settings = apiAuthSettings({
    VERCEL: '1',
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable',
  });
  assert.equal(settings.required, true);
  assert.equal(settings.configured, true);
});

test('une requête sans bearer est refusée avant tout appel Supabase', async () => {
  const result = await authorizeApiRequest({ headers: {} }, {
    env: { VERCEL: '1', VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable' },
    clientFactory() { throw new Error('ne doit pas être appelé'); },
  });
  assert.equal(result.status, 401);
});

test('un utilisateur différent du compte Coros est refusé', async () => {
  const result = await authorizeApiRequest({ headers: { authorization: 'Bearer valid' } }, {
    env: {
      VERCEL: '1', VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable', COROS_ALLOWED_USER_ID: 'owner',
    },
    clientFactory: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'intruder' } }, error: null }) } }),
  });
  assert.equal(result.status, 403);
});

test('le client joint le bearer sans exposer le token dans l’URL', async () => {
  const originalFetch = globalThis.fetch;
  let call;
  globalThis.fetch = async (url, options) => { call = { url, options }; return { ok: true }; };
  try {
    setApiAccessToken('session-secret');
    await authenticatedFetch('/api/snapshot', { headers: { accept: 'application/json' } });
    assert.equal(call.url, '/api/snapshot');
    assert.equal(call.options.headers.get('authorization'), 'Bearer session-secret');
  } finally {
    setApiAccessToken(null);
    globalThis.fetch = originalFetch;
  }
});
