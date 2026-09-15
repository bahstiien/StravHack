import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DataStoreError,
  createSupabaseDataRepository,
} from '../src/data/supabase-repository.js';
import { importLocalStorageToSupabase } from '../src/data/supabase-import.js';

function fakeClient(initial = [], failure = null) {
  let rows = structuredClone(initial);
  const calls = [];

  const query = (operation) => {
    const filters = [];
    const api = {
      select() { return api; },
      eq(column, value) { filters.push([column, value]); return api; },
      order() { return api; },
      limit() { return api; },
      maybeSingle() {
        const data = rows.find((row) => filters.every(([key, value]) => row[key] === value)) ?? null;
        return Promise.resolve(failure ? { data: null, error: failure } : { data: structuredClone(data), error: null });
      },
      then(resolve) {
        const data = rows.filter((row) => filters.every(([key, value]) => row[key] === value));
        return Promise.resolve(failure ? { data: null, error: failure } : { data: structuredClone(data), error: null }).then(resolve);
      },
    };
    calls.push({ operation, filters });
    return api;
  };

  return {
    calls,
    rows: () => structuredClone(rows),
    auth: {
      getUser: async () => failure
        ? { data: { user: null }, error: failure }
        : { data: { user: { id: 'user-1' } }, error: null },
    },
    from(table) {
      assert.equal(table, 'user_documents');
      return {
        select: () => query('select').select(),
        upsert(record) {
          calls.push({ operation: 'upsert', record: structuredClone(record) });
          const index = rows.findIndex((row) => row.user_id === record.user_id && row.document_type === record.document_type);
          rows = index < 0 ? [...rows, structuredClone(record)] : rows.map((row, i) => (i === index ? structuredClone(record) : row));
          return Promise.resolve(failure ? { error: failure } : { error: null });
        },
        delete() {
          const pending = query('delete');
          const originalThen = pending.then;
          pending.then = (resolve) => originalThen.call(pending, (result) => {
            if (!result.error) rows = rows.filter((row) => !pending.__matches?.(row));
            return resolve(result);
          });
          // Deletion behavior is not material to these focused tests.
          return pending;
        },
      };
    },
  };
}

test('repository persists and returns immutable settings payloads', async () => {
  const client = fakeClient();
  const repository = createSupabaseDataRepository(client, { now: () => '2026-09-14T12:00:00.000Z' });
  const settings = { goals: [{ id: 'g-1', name: 'CCC' }], equipment: ['halteres'], loadLevel: 7 };

  await repository.saveSettings(settings);
  settings.goals[0].name = 'mutated';
  const loaded = await repository.loadSettings();

  assert.equal(loaded.goals[0].name, 'CCC');
  assert.equal(loaded.loadLevel, 7);
  loaded.goals[0].name = 'also mutated';
  assert.equal((await repository.loadSettings()).goals[0].name, 'CCC');
});

test('repository surfaces Supabase errors with operation context', async () => {
  const repository = createSupabaseDataRepository(fakeClient([], { message: 'network down', code: '503' }));

  await assert.rejects(repository.loadPlanning(), (error) => {
    assert.ok(error instanceof DataStoreError);
    assert.equal(error.operation, 'loadPlanning');
    assert.match(error.message, /network down/);
    return true;
  });
});

test('local import is idempotent through stable document upserts', async () => {
  const client = fakeClient();
  const repository = createSupabaseDataRepository(client, { now: () => '2026-09-14T12:00:00.000Z' });
  const values = new Map([
    ['denivele.goals.v1', JSON.stringify([{ id: 'g-1', name: 'CCC' }])],
    ['denivele.equipment.v1', JSON.stringify(['poids-du-corps'])],
    ['denivele.planning.decisions.v1', JSON.stringify({ version: 1, data: [] })],
    ['denivele.guided.history.v1', JSON.stringify([{ id: 'result-1', completedAt: '2026-09-14T10:00:00.000Z' }])],
  ]);
  const storage = { getItem: (key) => values.get(key) ?? null };

  const first = await importLocalStorageToSupabase({ repository, storage });
  const second = await importLocalStorageToSupabase({ repository, storage });

  assert.deepEqual(first, { imported: true, settings: true, planning: true, guidedRun: false, history: 1 });
  assert.equal(second.imported, false);
  assert.equal(second.skipped, true);
  assert.equal(client.rows().filter((row) => row.document_type === 'goals').length, 1);
  assert.equal(client.rows().filter((row) => row.document_type === 'workout_history').length, 1);
});

test('local import does not overwrite existing remote documents', async () => {
  const client = fakeClient([
    {
      user_id: 'user-1',
      document_type: 'goals',
      payload: [{ id: 'remote-goal', name: 'UTMB' }],
    },
    {
      user_id: 'user-1',
      document_type: 'planning_decisions',
      payload: [{ sessionId: 'remote-session', action: 'validate' }],
    },
  ]);
  const repository = createSupabaseDataRepository(client, { now: () => '2026-09-14T12:00:00.000Z' });
  const values = new Map([
    ['denivele.goals.v1', JSON.stringify([{ id: 'local-goal', name: 'CCC' }])],
    ['denivele.planning.decisions.v1', JSON.stringify({ version: 1, data: [{ sessionId: 'local-session', action: 'reject' }] })],
  ]);

  await importLocalStorageToSupabase({ repository, storage: { getItem: (key) => values.get(key) ?? null } });

  assert.equal((await repository.loadSettings()).goals[0].id, 'remote-goal');
  assert.equal((await repository.loadPlanning()).decisions[0].sessionId, 'remote-session');
});

test('repository persists daily checkin history and draft documents', async () => {
  const client = fakeClient();
  const repository = createSupabaseDataRepository(client, { now: () => '2026-09-14T12:00:00.000Z' });
  const history = { '2026-09-14': { date: '2026-09-14', answers: { fatigue: 4 } } };
  const draft = { date: '2026-09-14', step: 2, answers: { sleep: 3 } };

  await repository.saveCheckins({ history, draft });

  assert.deepEqual(await repository.loadCheckins(), { history, draft });
});

test('repository persists and deduplicates post-workout feedback by activity', async () => {
  const client = fakeClient();
  const repository = createSupabaseDataRepository(client);
  await repository.appendWorkoutFeedback({ activityId: 'a1', rpe: 8 });
  await repository.appendWorkoutFeedback({ activityId: 'a1', rpe: 9 });
  await repository.appendWorkoutFeedback({ activityId: 'a2', rpe: 6 });
  const history = await repository.loadWorkoutFeedback();
  assert.deepEqual(history.map((item) => [item.activityId, item.rpe]), [['a2', 6], ['a1', 9]]);
  history[0].rpe = 1;
  assert.equal((await repository.loadWorkoutFeedback())[0].rpe, 6);
});

test('malformed local JSON is ignored without blocking valid data', async () => {
  const repository = createSupabaseDataRepository(fakeClient());
  const storage = { getItem: (key) => key === 'denivele.goals.v1' ? '{broken' : null };

  const result = await importLocalStorageToSupabase({ repository, storage });

  assert.deepEqual(result, { imported: true, settings: false, planning: false, guidedRun: false, history: 0 });
});
