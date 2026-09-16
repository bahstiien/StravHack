import assert from 'node:assert/strict';
import test from 'node:test';

import { validWorkoutPayload } from '../server/app.js';

test('le pont accepte une séance complète générée par le client', () => {
  const session = {
    id: 'plan-2026-09-20',
    title: 'Sortie longue',
    date: '2026-09-20',
    type: 'TRAIL',
    steps: [{ duration: 600 }],
  };
  assert.equal(validWorkoutPayload(session, session.id), true);
});

test('le pont refuse une séance forgée ou incomplète', () => {
  const valid = { id: 'plan-1', title: 'PPG', date: '2026-09-20', type: 'PPG', steps: [] };
  assert.equal(validWorkoutPayload({ ...valid, id: 'autre' }, 'plan-1'), false);
  assert.equal(validWorkoutPayload({ ...valid, date: 'demain' }, 'plan-1'), false);
  assert.equal(validWorkoutPayload({ ...valid, type: 'VELO' }, 'plan-1'), false);
  assert.equal(validWorkoutPayload({ ...valid, steps: null }, 'plan-1'), false);
});
