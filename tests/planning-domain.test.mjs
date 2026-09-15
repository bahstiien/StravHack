import test from 'node:test';
import assert from 'node:assert/strict';

import { memoryStorage } from '../src/data/workout-store.js';
import {
  loadPlanningState, saveDecisions, saveAvailability, saveExceptions,
} from '../src/data/planning-store.js';
import {
  validateSession, rejectSession, rescheduleSession, modifySession,
  cancelSession, restoreProposal, undoLastDecision,
} from '../src/data/planning-decisions.js';
import { effectiveAvailability } from '../src/data/planning-availability.js';
import { applyDecisionLayer } from '../src/data/planning-conflicts.js';

const NOW = '2026-09-14T18:30:00.000Z';
const session = (overrides = {}) => ({
  id: 'planned-a', date: '2026-09-17', title: 'Footing', type: 'TRAIL',
  intensity: 'easy', durationSec: 3600, load: 80, planned: true, done: false,
  ...overrides,
});

test('validation, refus, déplacement et modification produisent des décisions immuables', () => {
  const original = session();
  const valid = validateSession(original, { now: NOW });
  const rejected = rejectSession(original, { reason: 'fatigue', replacementStrategy: 'none', now: NOW });
  const moved = rescheduleSession(original, '2026-09-18', { now: NOW });
  const modified = modifySession(original, { durationSec: 1800 }, { now: NOW });

  assert.equal(valid.status, 'VALIDÉE');
  assert.equal(rejected.status, 'REFUSÉE');
  assert.equal(moved.status, 'DÉPLACÉE');
  assert.equal(moved.originalDate, '2026-09-17');
  assert.equal(modified.status, 'MODIFIÉE');
  assert.equal(modified.original.durationSec, 3600);
  assert.equal(original.durationSec, 3600);
  assert.throws(() => modifySession(original, { durationSec: -1 }), /durée/i);
  assert.equal(modifySession(original, { durationMin: 45, distanceKm: 8 }, { now: NOW }).changes.durationSec, 2700);
  assert.throws(() => rescheduleSession(original, '2026-02-31'), /date/i);
});

test('une activité réelle ne peut jamais recevoir une décision rétroactive', () => {
  const actual = session({ done: true, planned: false, activityId: 'coros-1' });
  for (const action of [
    () => rejectSession(actual), () => rescheduleSession(actual, '2026-09-18'),
    () => modifySession(actual, { durationSec: 60 }),
  ]) assert.throws(action, /réalisée/i);
});

test('la persistance est versionnée, séparée et tolère toute donnée invalide', () => {
  const storage = memoryStorage();
  const decisions = [validateSession(session(), { now: NOW })];
  assert.equal(saveDecisions(decisions, storage).ok, true);
  assert.equal(saveAvailability({ 4: { available: true, maxDurationMin: 90 } }, storage).ok, true);
  assert.equal(saveExceptions([{ date: '2026-09-17', available: false }], storage).ok, true);
  assert.equal(loadPlanningState(storage).decisions[0].status, 'VALIDÉE');
  assert.equal(loadPlanningState(storage).availability['4'].maxDurationMin, 90);

  const corrupt = memoryStorage({
    'denivele.planning.decisions.v1': '{oops',
    'denivele.planning.availability.v1': JSON.stringify({ version: 1, data: { x: 'bad' } }),
    'denivele.planning.exceptions.v1': JSON.stringify({ version: 99, data: [] }),
  });
  assert.deepEqual(loadPlanningState(corrupt), { decisions: [], availability: {}, exceptions: [], drafts: {} });

  const shapedButInvalid = memoryStorage({
    'denivele.planning.decisions.v1': JSON.stringify({ version: 1, data: [{ sessionId: 'x', action: 'reschedule', status: 'DÉPLACÉE', updatedAt: NOW }] }),
  });
  assert.deepEqual(loadPlanningState(shapedButInvalid).decisions, []);
});

test('une exception datée prend priorité sur la disponibilité récurrente', () => {
  const recurring = { 4: { available: true, maxDurationMin: 120, equipment: ['banc'] } };
  const exceptions = [{ date: '2026-09-17', available: false, reason: 'rendez-vous' }];
  const result = effectiveAvailability('2026-09-17', recurring, exceptions);
  assert.equal(result.available, false);
  assert.equal(result.source, 'exception');
});

test('les décisions survivent au recalcul, le refus ne recrée pas la séance et plusieurs séances partagent une date', () => {
  const a = session();
  const b = session({ id: 'planned-b', title: 'PPG', type: 'PPG', load: 24 });
  const decisions = [rejectSession(a, { now: NOW }), validateSession(b, { now: NOW })];
  const result = applyDecisionLayer([a, b], decisions, [], {}, []);
  assert.equal(result.sessions.some((s) => s.id === 'planned-a'), false);
  assert.equal(result.sessions.find((s) => s.id === 'planned-b').status, 'VALIDÉE');
  assert.equal(result.history.some((h) => h.sessionId === 'planned-a'), true);
});

test('déplacer vers un jour libre ou occupé conserve la séance et signale les conflits', () => {
  const a = session({ intensity: 'quality', load: 120 });
  const occupied = session({ id: 'planned-b', date: '2026-09-18', intensity: 'quality', load: 104 });
  const moved = applyDecisionLayer([a], [rescheduleSession(a, '2026-09-18', { now: NOW })], [], {}, []);
  assert.equal(moved.sessions[0].date, '2026-09-18');
  assert.equal(moved.sessions[0].status, 'DÉPLACÉE');

  const crowded = applyDecisionLayer([a, occupied], [rescheduleSession(a, '2026-09-18', { now: NOW })], [], {}, []);
  assert.equal(crowded.sessions.filter((s) => s.date === '2026-09-18').length, 2);
  assert.ok(crowded.conflicts.some((c) => c.code === 'SEANCES_QUALITE_CONSECUTIVES' || c.code === 'PLUSIEURS_SEANCES_MEME_JOUR'));
});

test('indisponibilité, durée, matériel et proximité du club sont des avertissements non bloquants', () => {
  const ppg = session({ type: 'PPG', title: 'PPG jambes', date: '2026-09-14', equipment: ['banc'], heavyLegs: true });
  const club = session({ id: 'club', date: '2026-09-15', isClub: true, intensity: 'quality' });
  const availability = { 1: { available: false, maxDurationMin: 30, equipment: [] } };
  const result = applyDecisionLayer([ppg, club], [], [], availability, []);
  const codes = result.conflicts.map((c) => c.code);
  assert.ok(codes.includes('JOUR_INDISPONIBLE'));
  assert.ok(codes.includes('DUREE_DEPASSEE'));
  assert.ok(codes.includes('MATERIEL_INDISPONIBLE'));
  assert.ok(codes.includes('PPG_JAMBES_AVANT_CLUB'));
  assert.equal(result.sessions.length, 2, 'un avertissement ne bloque pas le choix');
});

test('modifier la durée recalcule la charge et les totaux hebdomadaires', () => {
  const a = session({ load: 80, durationSec: 3600 });
  const result = applyDecisionLayer([a], [modifySession(a, { durationSec: 1800 }, { now: NOW })], [], {}, []);
  assert.equal(result.sessions[0].durationSec, 1800);
  assert.equal(result.sessions[0].load, 40);
  assert.equal(result.weeklyLoad['2026-09-14'], 40);
});

test('restaurer et annuler rétablissent la proposition originale', () => {
  const a = session();
  const modified = modifySession(a, { durationSec: 1800 }, { now: NOW });
  assert.deepEqual(restoreProposal([modified], a.id), []);
  const sequence = [validateSession(a, { now: NOW }), modified];
  assert.deepEqual(undoLastDecision(sequence), [sequence[0]]);
  assert.equal(cancelSession(a, { now: NOW }).status, 'ANNULÉE');
});

test('une activité réelle remplace la proposition correspondante après synchronisation', () => {
  const proposed = session();
  const actual = session({ id: 'activity-coros-1', planned: false, done: true, load: 92, activityId: 'coros-1' });
  const result = applyDecisionLayer([proposed], [validateSession(proposed, { now: NOW })], [actual], {}, []);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].status, 'RÉALISÉE');
  assert.equal(result.sessions[0].load, 92);
});

test('une décision verrouillée reste visible si le recalcul ne repropose plus la séance', () => {
  const proposed = session();
  const decision = rescheduleSession(proposed, '2026-09-20', { now: NOW });
  const result = applyDecisionLayer([], [decision], [], {}, []);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].date, '2026-09-20');
  assert.equal(result.sessions[0].status, 'DÉPLACÉE');
});
