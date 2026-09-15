import test from 'node:test';
import assert from 'node:assert/strict';

import {
  groupSessionsByDay, groupSessionsByWeek, groupSessionsByMonth,
  monthlyStats, projectToGoal,
} from '../src/data/planning-calendar.js';

const sessions = [
  { id: 'p1', date: '2026-09-14', planned: true, done: false, type: 'TRAIL', load: 80, durationSec: 3600, dplus: 400, weekendBlock: true, blockId: 'mountain-1', phase: 'spécifique', phaseLabel: 'Bloc spécifique', weeksOut: 4, easyWeek: false },
  { id: 'a1', date: '2026-09-14', planned: false, done: true, type: 'PPG', load: 20, durationSec: 1800, distanceKm: 0 },
  { id: 'a2', date: '2026-09-15', planned: false, done: true, type: 'TRAIL', load: 90, durationSec: 4000, distanceKm: 12, dplus: 500 },
  { id: 'missed', date: '2026-09-02', planned: true, done: false, status: 'REFUSÉE', type: 'TRAIL', load: 30 },
  { id: 'future', date: '2026-10-01', planned: true, done: false, type: 'TRAIL', load: 120 },
];

test('agrège immuablement par jour, semaine et mois, y compris plusieurs séances', () => {
  const day = groupSessionsByDay(sessions);
  assert.equal(day['2026-09-14'].sessions.length, 2);
  assert.equal(day['2026-09-14'].load, 100);
  assert.equal(day['2026-09-14'].hasWeekendBlock, true);
  assert.equal(groupSessionsByWeek(sessions)['2026-09-14'].sessions.length, 3);
  assert.equal(groupSessionsByMonth(sessions)['2026-09'].sessions.length, 4);
  assert.equal(sessions[0].load, 80);
});

test('calcule les statistiques du mois en séparant prévu, réalisé et manqué', () => {
  const stats = monthlyStats(sessions, '2026-09', { today: new Date(2026, 8, 20) });
  assert.deepEqual(stats, {
    plannedLoad: 110, completedLoad: 110, completedSessions: 2, missedSessions: 1,
    durationSec: 5800, distanceKm: 12, elevationGainM: 500,
  });
});

test('la projection lit exclusivement les champs déjà produits par buildPlan', () => {
  const plan = [
    ...sessions,
    { id: 'taper', date: '2026-10-05', planned: true, phase: 'affûtage', phaseLabel: 'Affûtage', weeksOut: 1, easyWeek: false },
    { id: 'race', date: '2026-10-12', planned: true, phase: 'course', phaseLabel: 'Semaine de course', weeksOut: 0, easyWeek: false },
    { id: 'easy', date: '2026-09-21', planned: true, phase: 'spécifique', phaseLabel: 'Bloc spécifique', weeksOut: 3, easyWeek: true },
  ];
  const goal = { id: 'g', name: 'Trail A', date: '2026-10-12', priority: 'A' };
  const projection = projectToGoal(plan, [goal], { today: new Date(2026, 8, 14) });
  assert.equal(projection.goal, goal);
  assert.equal(projection.weeksRemaining, 4);
  assert.equal(projection.currentPhase, 'spécifique');
  assert.ok(projection.milestones.some((m) => m.kind === 'assimilation'));
  assert.ok(projection.milestones.some((m) => m.kind === 'weekend-block'));
  assert.ok(projection.milestones.some((m) => m.kind === 'taper'));
  assert.ok(projection.milestones.some((m) => m.kind === 'race'));
});

test('la projection sans objectif A reste vide', () => {
  assert.equal(projectToGoal(sessions, [{ priority: 'B', date: '2026-10-12' }]), null);
});
