import test from 'node:test';
import assert from 'node:assert/strict';

import { LOAD_LEVELS, normalizeLoadLevel } from '../src/data/load-level.js';
import { buildPlan } from '../src/data/plan.js';

const history = [
  { id: 'a', date: '2026-08-17', type: 'TRAIL', load: 350, durationSec: 7200, dplus: 800 },
  { id: 'b', date: '2026-08-24', type: 'TRAIL', load: 380, durationSec: 7800, dplus: 900 },
  { id: 'c', date: '2026-08-31', type: 'TRAIL', load: 400, durationSec: 8400, dplus: 1000 },
  { id: 'd', date: '2026-09-07', type: 'TRAIL', load: 420, durationSec: 9000, dplus: 1100 },
];

const makePlan = (loadLevel) => buildPlan({
  sessions: history, load: [{ ratio: 0.75 }], fitness: { thresholdPaceSecPerKm: 240 },
  goals: [{ id: 'g', name: 'Ultra', priority: 'A', date: '2026-11-28', distanceKm: 80, elevationGainM: 5000 }],
  club: { day: 2, sessions: [] }, ppgLibrary: [], equipment: ['poids-du-corps'],
  today: new Date(2026, 8, 14, 12), weeks: 1, loadLevel,
});

test('les huit niveaux ont un libellé et une progression ordonnée', () => {
  assert.equal(LOAD_LEVELS.length, 8);
  assert.deepEqual(LOAD_LEVELS.map((item) => item.level), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(LOAD_LEVELS.every((item) => item.label && item.description));
  assert.equal(normalizeLoadLevel(undefined), 4);
  assert.equal(normalizeLoadLevel('8'), 8);
  assert.equal(normalizeLoadLevel(12), 8);
  assert.equal(normalizeLoadLevel(-2), 1);
});

test('niveau 1 ne programme que des footings parmi les séances sportives', () => {
  const sports = makePlan(1).filter((session) => session.type !== 'REPOS');
  assert.ok(sports.length > 0);
  assert.ok(sports.every((session) => session.type === 'TRAIL' && session.intensity !== 'quality'));
  assert.ok(sports.every((session) => /footing|sortie longue/i.test(session.title)));
});

test('la charge hebdomadaire augmente de façon monotone de 1 à 8', () => {
  const totals = Array.from({ length: 8 }, (_, index) => makePlan(index + 1)
    .reduce((sum, session) => sum + session.load, 0));
  for (let index = 1; index < totals.length; index += 1) assert.ok(totals[index] >= totals[index - 1]);
  assert.ok(totals[7] > totals[0] * 1.5);
});

test('niveau 8 crée un week-end bloc montagne samedi et dimanche', () => {
  const weekend = makePlan(8).filter((session) => session.weekendBlock);
  assert.equal(weekend.length, 2);
  assert.deepEqual(weekend.map((session) => new Date(`${session.date}T12:00:00`).getDay()), [6, 0]);
  assert.ok(weekend.every((session) => session.dplus > 0));
  assert.ok(weekend.every((session) => /bloc montagne/i.test(session.title)));
});

test('niveau 7 réserve aussi le bloc montagne, niveau 6 reste sur une seule sortie longue', () => {
  assert.equal(makePlan(7).filter((session) => session.weekendBlock).length, 2);
  assert.equal(makePlan(6).filter((session) => session.weekendBlock).length, 0);
});
