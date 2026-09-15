// Les tests de la persistance de la séance guidée.
//
// Ce qui compte ici n'est pas d'écrire — c'est de relire juste, et de ne PAS
// proposer une reprise quand ce qu'on a relu ne vaut rien.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  saveRun, loadRun, clearRun, saveResult, loadHistory,
  memoryStorage, failingStorage, MAX_RUN_AGE_MS,
} from '../src/data/workout-store.js';

import { fromWodSession } from '../src/data/workout-plan.js';
import {
  createRun, tick, pause, validateRound, addRecovery, view, buildResult, finish,
} from '../src/data/workout-engine.js';
import { generateWod } from '../src/data/wod.js';

const T0 = 1_700_000_000_000;

const seance = () => {
  const res = generateWod({
    durationMin: 40, type: 'crossfit', level: 'intermediaire', goal: 'conditionnement',
    equipment: ['poids-du-corps', 'halteres', 'kettlebell'],
    constraints: { pain: '', injuries: '', avoid: '' }, seed: 11,
  });
  assert.equal(res.ok, true);
  return fromWodSession(res.session);
};

test('une séance en cours se sauvegarde et se relit à l’identique', () => {
  const storage = memoryStorage();
  const def = seance();
  let state = tick(def, createRun(def, T0), T0 + 400_000);
  state = validateRound(def, state, T0 + 400_000);
  state = addRecovery(def, state, T0 + 400_000, 30);
  state = pause(state, T0 + 400_000);

  assert.deepEqual(saveRun({ definition: def, state, now: T0 }, storage), { ok: true });

  const relu = loadRun(storage, T0 + 500_000);
  assert.ok(relu, 'rien n’a été relu');
  assert.deepEqual(relu.state, state);
  assert.deepEqual(relu.definition, def);

  // Et la reprise redonne exactement la même vue.
  assert.deepEqual(
    view(relu.definition, relu.state, T0 + 500_000),
    view(def, state, T0 + 500_000),
  );
});

test('une séance trop vieille n’est plus proposée à la reprise', () => {
  const storage = memoryStorage();
  const def = seance();
  const state = tick(def, createRun(def, T0), T0 + 60_000);
  saveRun({ definition: def, state, now: T0 }, storage);

  assert.ok(loadRun(storage, T0 + MAX_RUN_AGE_MS - 1000));
  assert.equal(loadRun(storage, T0 + MAX_RUN_AGE_MS + 1000), null);
});

test('une séance déjà terminée n’est pas proposée à la reprise', () => {
  const storage = memoryStorage();
  const def = seance();
  const state = finish(def, tick(def, createRun(def, T0), T0 + 60_000), T0 + 60_000);
  saveRun({ definition: def, state, now: T0 }, storage);
  assert.equal(loadRun(storage, T0 + 70_000), null);
});

test('un stockage illisible ou corrompu ne propose rien, et ne lève pas', () => {
  assert.equal(loadRun(memoryStorage(), T0), null);
  assert.equal(loadRun(memoryStorage({ 'denivele.guided.run.v1': 'ceci n’est pas du JSON' }), T0), null);
  assert.equal(loadRun(memoryStorage({ 'denivele.guided.run.v1': '{"savedAt":1}' }), T0), null);
  assert.equal(loadRun(null, T0), null);

  // Une définition qui ne passe plus la validation : on n’essaie pas de la jouer.
  const bancale = JSON.stringify({
    savedAt: T0,
    definition: { title: 'x', plannedDurationSeconds: 60, blocks: [{ id: 'a', name: 'a', format: 'amrap', durationSeconds: 0, stations: [] }] },
    state: { status: 'paused' },
  });
  assert.equal(loadRun(memoryStorage({ 'denivele.guided.run.v1': bancale }), T0), null);
});

test('un stockage qui refuse d’écrire donne une raison lisible, pas une exception', () => {
  const res = saveRun({ definition: seance(), state: {} }, failingStorage());
  assert.equal(res.ok, false);
  assert.ok(res.reason.length > 10);
  assert.ok(!/undefined|\[object/.test(res.reason));

  const bilan = saveResult({ id: 'r1' }, failingStorage());
  assert.equal(bilan.ok, false);
  assert.ok(bilan.reason.includes('enregistré'));

  assert.equal(saveRun({ definition: {}, state: {} }, null).ok, false);
  assert.equal(saveResult({ id: 'r1' }, null).ok, false);
});

test('effacer la séance en cours la retire vraiment', () => {
  const storage = memoryStorage();
  const def = seance();
  saveRun({ definition: def, state: tick(def, createRun(def, T0), T0 + 60_000), now: T0 }, storage);
  assert.ok(loadRun(storage, T0 + 60_000));
  clearRun(storage);
  assert.equal(loadRun(storage, T0 + 60_000), null);
});

test('les bilans s’empilent, le plus récent d’abord, sans doublon', () => {
  const storage = memoryStorage();
  const def = seance();
  const state = finish(def, tick(def, createRun(def, T0), T0 + 600_000), T0 + 600_000);

  const a = { ...buildResult(def, state, { rpe: 7 }), id: 'a' };
  const b = { ...buildResult(def, state, { rpe: 9 }), id: 'b' };

  assert.equal(saveResult(a, storage).ok, true);
  assert.equal(saveResult(b, storage).ok, true);
  assert.equal(saveResult({ ...a, rpe: 8 }, storage).count, 2, 'le même bilan ne doit pas être stocké deux fois');

  const history = loadHistory(storage);
  assert.equal(history.length, 2);
  assert.equal(history[0].id, 'a');
  assert.equal(history[0].rpe, 8, 'le bilan réenregistré doit être le plus récent');
  assert.equal(loadHistory(null).length, 0);
  assert.equal(loadHistory(memoryStorage({ 'denivele.guided.history.v1': 'pas du JSON' })).length, 0);
});
