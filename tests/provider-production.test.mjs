import assert from 'node:assert/strict';
import test from 'node:test';

import { emptySnapshot, loadClubCatalog, loadSnapshot, pushToWatch } from '../src/data/provider.js';

test('la production ne remplace jamais une source absente par des données de démo', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  try {
    const snapshot = await loadSnapshot({ allowFixtures: false });
    assert.deepEqual(snapshot.sessions, []);
    assert.deepEqual(snapshot.activities, []);
    assert.equal(snapshot.meta.source, 'none');
    assert.match(snapshot.meta.reason, /Aucune donnée Coros/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('un snapshot partiel de production reste partiel et ne récupère pas les fixtures', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => url === '/api/snapshot'
    ? { ok: true, json: async () => ({ athlete: { name: 'Athlète' }, sessions: [], activities: [], meta: { source: 'none' } }) }
    : { ok: false, status: 404 };
  try {
    const snapshot = await loadSnapshot({ allowFixtures: false });
    assert.deepEqual(snapshot.sessions, []);
    assert.notEqual(snapshot.athlete?.name, 'Bastien');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('l’état vide est un nouvel objet immuable entre deux lectures', () => {
  const first = emptySnapshot();
  const second = emptySnapshot();
  first.sessions.push({ id: 'x' });
  assert.deepEqual(second.sessions, []);
});

test('les séances club publiques restent disponibles sans catalogue Supabase', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ day: 2, sessions: [{ date: '2026-09-15', name: 'Pyramide' }] }) });
  try {
    assert.deepEqual(await loadClubCatalog(), { day: 2, sessions: [{ date: '2026-09-15', name: 'Pyramide' }] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('une séance générée côté app est envoyée intégralement au pont Coros', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  const session = { id: 'plan-2026-09-20', title: 'Sortie longue', date: '2026-09-20', type: 'TRAIL', steps: [{ duration: 600 }] };
  try {
    assert.equal((await pushToWatch(session)).ok, true);
    assert.equal(request.url, '/api/push-workout');
    assert.deepEqual(JSON.parse(request.options.body), { sessionId: session.id, session });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
