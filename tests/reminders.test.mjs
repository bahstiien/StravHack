import test from 'node:test';
import assert from 'node:assert/strict';

import { generateReminders, deduplicateReminders, isQuietDay } from '../src/data/reminders.js';

const now = new Date('2026-09-14T08:00:00+02:00');
const settings = { enabled: true, workoutLeadMinutes: 120, dailyCheckin: true, planningAlerts: true, recoveryAlerts: true, goalAlerts: true, quietDays: [] };

test('génère des rappels précis, actionnables, priorisés et expirables', () => {
  const result = generateReminders({
    now, settings,
    sessions: [{ id: 's1', date: '2026-09-14', startTime: '09:00', planned: true, done: false }],
    checkins: [], conflicts: [{ id: 'c1', date: '2026-09-14', code: 'JOUR_INDISPONIBLE', message: 'Jour indisponible' }],
    feedback: [{ sessionId: 'old', date: '2026-09-13', pain: 6 }, { sessionId: 'older', date: '2026-09-12', pain: 5 }],
    load: [{ ratio: 1.2 }],
    plan: [{ id: 'block', date: '2026-09-19', weekendBlock: true, blockId: 'b1' }, { id: 'taper', date: '2026-09-21', phase: 'affûtage' }],
    goals: [{ id: 'g1', name: 'Course', date: '2026-09-20', priority: 'A' }],
    planningChanges: [{ id: 'd1', important: true, updatedAt: '2026-09-14T07:00:00Z' }],
  });
  assert.ok(result.length >= 8);
  assert.ok(result.every((r) => r.reason && r.action && r.href && r.priority && r.expiresAt && r.dedupeKey));
  assert.equal(result[0].priority, 'urgent');
});

test('déduplique par clé en conservant le rappel le plus prioritaire et non expiré', () => {
  const items = [
    { dedupeKey: 'x', priority: 'normal', expiresAt: '2026-09-15T00:00:00Z' },
    { dedupeKey: 'x', priority: 'high', expiresAt: '2026-09-16T00:00:00Z' },
    { dedupeKey: 'old', priority: 'urgent', expiresAt: '2026-09-13T00:00:00Z' },
  ];
  assert.deepEqual(deduplicateReminders(items, now).map((x) => x.priority), ['high']);
});

test('respecte les jours silencieux et les préférences désactivées', () => {
  assert.equal(isQuietDay(now, [1]), true);
  assert.equal(isQuietDay(now, ['lun']), true);
  assert.equal(isQuietDay(new Date('2026-09-20T08:00:00+02:00'), ['dim']), true);
  assert.deepEqual(generateReminders({ now, settings: { ...settings, quietDays: [1] }, sessions: [] }), []);
  assert.deepEqual(generateReminders({ now, settings: { ...settings, quietDays: ['lun'] }, sessions: [] }), []);
  assert.deepEqual(generateReminders({ now, settings: { ...settings, enabled: false }, sessions: [] }), []);
});

test('lit le contrat persisté pour le délai avant séance et les objectifs', () => {
  const session = { id: 'later', date: '2026-09-14', startTime: '10:30', planned: true, done: false };
  assert.equal(generateReminders({ now, settings: { ...settings, beforeSessionMinutes: 60 }, sessions: [session] })
    .some((item) => item.type === 'upcoming-workout'), false);
  assert.equal(generateReminders({
    now,
    settings: { ...settings, goalReminders: false },
    goals: [{ id: 'goal', date: '2026-09-20', priority: 'A' }],
  }).some((item) => item.type === 'goal-approaching'), false);
});

test('une séance passée non réalisée expire après son rappel et ne se répète pas', () => {
  const result = generateReminders({
    now, settings,
    sessions: [{ id: 'missed', date: '2026-09-13', planned: true, done: false }],
  });
  const missed = result.find((r) => r.type === 'missed-workout');
  assert.equal(missed.dedupeKey, 'missed-workout:missed');
  assert.ok(new Date(missed.expiresAt) > now);
});

test('deux feedbacks réels avec douleur déclenchent le rappel de douleur persistante', () => {
  const result = generateReminders({
    now, settings,
    feedback: [
      { activityId: 'a1', sessionId: 's1', date: '2026-09-13', pain: true },
      { activityId: 'a2', sessionId: 's2', date: '2026-09-12', pain: true },
    ],
  });
  assert.equal(result.some((item) => item.type === 'persistent-pain'), true);
});
