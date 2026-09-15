import assert from 'node:assert/strict';
import test from 'node:test';

import { emptySnapshot, loadSnapshot } from '../src/data/provider.js';

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
