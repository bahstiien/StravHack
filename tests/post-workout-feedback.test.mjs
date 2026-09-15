import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWorkoutFeedback,
  applyWorkoutFeedback,
} from '../src/data/post-workout-feedback.js';

const completed = {
  id: 'run-1', activityId: 'activity-1', date: '2026-09-14',
  type: 'TRAIL', title: 'Seuil', done: true, load: 120, durationSec: 3600,
};

const futurePlan = [
  { id: 'easy', date: '2026-09-16', type: 'TRAIL', title: 'Footing', planned: true, load: 35, durationSec: 2700, zone: 'Z1–Z2' },
  { id: 'quality', date: '2026-09-18', type: 'TRAIL', title: 'Tempo', planned: true, load: 100, durationSec: 3600, zone: 'Z3–Z4' },
];

test('un feedback validé est normalisé sans muter la saisie', () => {
  const input = { activityId: 'activity-1', sessionId: 'run-1', date: '2026-09-14', rpe: 9, completion: 'complete', pain: false, note: '  dur  ' };
  const feedback = createWorkoutFeedback(input, () => '2026-09-15T08:00:00.000Z');
  assert.deepEqual(feedback, {
    version: 1, activityId: 'activity-1', sessionId: 'run-1', date: '2026-09-14',
    rpe: 9, completion: 'complete', pain: false, note: 'dur',
    validatedAt: '2026-09-15T08:00:00.000Z',
  });
  assert.equal(input.note, '  dur  ');
});

test('un RPE très élevé raccourcit la prochaine séance exigeante et explique le changement', () => {
  const feedback = createWorkoutFeedback({ activityId: 'activity-1', sessionId: 'run-1', date: '2026-09-14', rpe: 9, completion: 'complete', pain: false });
  const result = applyWorkoutFeedback(futurePlan, [feedback], [completed]);
  assert.equal(result.sessions[0].durationSec, 2700);
  assert.equal(result.sessions[1].durationSec, 2880);
  assert.equal(result.sessions[1].load, 80);
  assert.equal(result.sessions[1].feedbackAdjusted, true);
  assert.match(result.summary.message, /RPE 9/i);
  assert.match(result.summary.message, /60.*48|48.*60/);
  assert.deepEqual(futurePlan[1], { id: 'quality', date: '2026-09-18', type: 'TRAIL', title: 'Tempo', planned: true, load: 100, durationSec: 3600, zone: 'Z3–Z4' });
});

test('une douleur rend la prochaine séance facile et visible', () => {
  const feedback = createWorkoutFeedback({ activityId: 'activity-1', sessionId: 'run-1', date: '2026-09-14', rpe: 7, completion: 'complete', pain: true });
  const result = applyWorkoutFeedback(futurePlan, [feedback], [completed]);
  assert.equal(result.sessions[1].zone, 'Z1–Z2');
  assert.equal(result.sessions[1].load, 70);
  assert.match(result.summary.message, /douleur/i);
});

test('une séance partielle allège la suite, un effort bien encaissé ne surenchérit pas', () => {
  const partial = createWorkoutFeedback({ activityId: 'activity-1', sessionId: 'run-1', date: '2026-09-14', rpe: 7, completion: 'partial', pain: false });
  assert.equal(applyWorkoutFeedback(futurePlan, [partial], [completed]).sessions[1].load, 85);

  const steady = createWorkoutFeedback({ activityId: 'activity-1', sessionId: 'run-1', date: '2026-09-14', rpe: 6, completion: 'complete', pain: false });
  const result = applyWorkoutFeedback(futurePlan, [steady], [completed]);
  assert.deepEqual(result.sessions, futurePlan);
  assert.equal(result.summary, null);
});

test('un feedback invalide est refusé à la frontière', () => {
  assert.throws(() => createWorkoutFeedback({ activityId: '', date: 'non', rpe: 11, completion: 'lost' }), /feedback/i);
});

test('un feedback sans activité réellement remontée ne modifie jamais le plan', () => {
  const feedback = createWorkoutFeedback({ activityId: 'inconnue', date: '2026-09-14', rpe: 10, completion: 'complete', pain: true });
  const result = applyWorkoutFeedback(futurePlan, [feedback], [completed]);
  assert.deepEqual(result.sessions, futurePlan);
  assert.equal(result.summary, null);
});
