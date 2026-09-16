import test from 'node:test';
import assert from 'node:assert/strict';

import { loadPlanningView, savePlanningView, nextPlanningView } from '../src/data/planning-view.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('la vue Planning mémorise uniquement semaine, mois ou carnet', () => {
  const storage = memoryStorage();
  assert.equal(loadPlanningView(storage), 'week');
  assert.equal(savePlanningView('month', storage), true);
  assert.equal(loadPlanningView(storage), 'month');
  assert.equal(savePlanningView('inconnue', storage), false);
  assert.equal(loadPlanningView(storage), 'month');
});

test('les flèches parcourent les trois vues en boucle', () => {
  assert.equal(nextPlanningView('week', 1), 'month');
  assert.equal(nextPlanningView('month', 1), 'log');
  assert.equal(nextPlanningView('log', 1), 'week');
  assert.equal(nextPlanningView('week', -1), 'log');
});

test('un stockage indisponible ne casse jamais la navigation', () => {
  const failing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(loadPlanningView(failing), 'week');
  assert.equal(savePlanningView('log', failing), false);
});
