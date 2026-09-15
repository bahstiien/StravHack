// Validation des réponses, entrée versionnée, brouillon et historique.
//
// Tout ce qui est ici tourne sans navigateur : le stockage est injecté, et la
// validation est une fonction pure. C'est ce qui permet d'éprouver la lecture
// de données invalides sans avoir à corrompre un vrai localStorage.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHECKIN_VERSION, TIME_OPTIONS, BODY_AREAS, SORENESS_LEVELS, PAIN_MOMENTS,
  emptyAnswers, normalizeAnswers, validateAnswers, isComplete,
  createEntry, reviseEntry, decideEntry, areaLabel, attachCompletedSession,
} from '../src/data/checkin-model.js';
import {
  CHECKIN_STORAGE_KEYS, loadCheckinHistory, saveCheckinEntry, loadCheckinFor,
  clearCheckinHistory, loadCheckinDraft, saveCheckinDraft, clearCheckinDraft,
} from '../src/data/checkin-store.js';
import { memoryStorage, failingStorage } from '../src/data/workout-store.js';

const good = () => ({
  availableMinutes: 40,
  fatigue: 3,
  sleepQuality: 4,
  sleepMinutes: 435,
  soreness: { level: 'light', areas: ['calves'] },
  motivation: 4,
  pain: {
    present: false, area: null, intensity: null, kind: '',
    moments: [], triggers: [], limiting: false,
  },
  stress: 2,
  legs: 3,
  desire: 'run',
  availableEquipment: ['poids-du-corps', 'halteres'],
  outdoor: true,
  comment: '',
});

/* ── Validation ─────────────────────────────────────────────────────────── */

test('les réponses vides ne sont pas valides et ne sont pas complètes', () => {
  const empty = emptyAnswers();
  assert.equal(isComplete(empty), false);
  const res = validateAnswers(empty);
  assert.equal(res.ok, false);
  for (const field of ['availableMinutes', 'fatigue', 'sleepQuality', 'motivation']) {
    assert.ok(res.errors[field], `${field} doit être signalé manquant`);
  }
});

test('un jeu de réponses complet passe la validation', () => {
  const res = validateAnswers(good());
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.equal(res.value.availableMinutes, 40);
  assert.equal(isComplete(res.value), true);
});

test('chaque durée proposée est acceptée, y compris l’indisponibilité', () => {
  for (const option of TIME_OPTIONS) {
    const res = validateAnswers({ ...good(), availableMinutes: option.minutes });
    assert.equal(res.ok, true, `${option.id} refusé`);
  }
  assert.ok(TIME_OPTIONS.some((o) => o.minutes === 0), 'l’indisponibilité doit être proposée');
  assert.ok(TIME_OPTIONS.some((o) => o.minutes === 180));
});

test('une durée personnalisée hors bornes est refusée', () => {
  assert.equal(validateAnswers({ ...good(), availableMinutes: 45 }).ok, true);
  assert.equal(validateAnswers({ ...good(), availableMinutes: -5 }).ok, false);
  assert.equal(validateAnswers({ ...good(), availableMinutes: 2000 }).ok, false);
  assert.equal(validateAnswers({ ...good(), availableMinutes: 'quarante' }).ok, false);
});

test('les notes de 1 à 5 refusent tout ce qui sort de l’échelle', () => {
  for (const field of ['fatigue', 'sleepQuality', 'motivation']) {
    assert.equal(validateAnswers({ ...good(), [field]: 0 }).ok, false, field);
    assert.equal(validateAnswers({ ...good(), [field]: 6 }).ok, false, field);
    assert.equal(validateAnswers({ ...good(), [field]: 2.5 }).ok, false, field);
    assert.equal(validateAnswers({ ...good(), [field]: 5 }).ok, true, field);
  }
});

test('la durée de sommeil est facultative mais bornée', () => {
  assert.equal(validateAnswers({ ...good(), sleepMinutes: null }).ok, true);
  assert.equal(validateAnswers({ ...good(), sleepMinutes: 0 }).ok, true);
  assert.equal(validateAnswers({ ...good(), sleepMinutes: 1500 }).ok, false);
});

test('les courbatures : niveau connu, zones connues, et aucune zone sans courbature', () => {
  assert.equal(validateAnswers({ ...good(), soreness: { level: 'énorme', areas: [] } }).ok, false);
  assert.equal(validateAnswers({ ...good(), soreness: { level: 'heavy', areas: ['tentacules'] } }).ok, false);
  for (const level of SORENESS_LEVELS) {
    assert.equal(
      validateAnswers({ ...good(), soreness: { level: level.id, areas: [] } }).ok,
      true, level.id,
    );
  }
  const none = normalizeAnswers({ ...good(), soreness: { level: 'none', areas: ['calves'] } });
  assert.deepEqual(none.soreness.areas, [], 'aucune courbature ne peut pas avoir de zone');
});

test('les onze zones du corps sont proposées et étiquetées en français', () => {
  assert.equal(BODY_AREAS.length, 11);
  assert.equal(areaLabel('calves'), 'Mollets');
  assert.equal(areaLabel('quadriceps'), 'Quadriceps');
  assert.equal(areaLabel('inconnu'), 'inconnu');
});

test('une douleur déclarée exige sa zone et son intensité', () => {
  const painful = {
    ...good(),
    pain: {
      present: true, area: null, intensity: null, kind: '',
      moments: [], triggers: [], limiting: false,
    },
  };
  const res = validateAnswers(painful);
  assert.equal(res.ok, false);
  assert.ok(res.errors['pain.area']);
  assert.ok(res.errors['pain.intensity']);

  const complete = validateAnswers({
    ...good(),
    pain: {
      present: true, area: 'knees', intensity: 4, kind: 'brûlure',
      moments: ['running'], triggers: ['descente'], limiting: false,
    },
  });
  assert.equal(complete.ok, true, JSON.stringify(complete.errors));
});

test('l’intensité de douleur va de 1 à 10 et le moment doit être connu', () => {
  const base = {
    present: true, area: 'knees', intensity: 4, kind: '',
    moments: [], triggers: [], limiting: false,
  };
  assert.equal(validateAnswers({ ...good(), pain: { ...base, intensity: 0 } }).ok, false);
  assert.equal(validateAnswers({ ...good(), pain: { ...base, intensity: 11 } }).ok, false);
  assert.equal(validateAnswers({ ...good(), pain: { ...base, intensity: 10 } }).ok, true);
  assert.equal(validateAnswers({ ...good(), pain: { ...base, moments: ['la nuit'] } }).ok, false);
  assert.deepEqual(PAIN_MOMENTS.map((m) => m.id), ['rest', 'movement', 'running']);
});

test('sans douleur, les détails de douleur sont effacés à la normalisation', () => {
  const normalized = normalizeAnswers({
    ...good(),
    pain: {
      present: false, area: 'knees', intensity: 8, kind: 'x',
      moments: ['rest'], triggers: ['a'], limiting: true,
    },
  });
  assert.equal(normalized.pain.area, null);
  assert.equal(normalized.pain.intensity, null);
  assert.deepEqual(normalized.pain.moments, []);
  assert.equal(normalized.pain.limiting, false);
});

test('les questions facultatives restent facultatives', () => {
  const res = validateAnswers({
    ...good(),
    stress: null, legs: null, desire: null, availableEquipment: null, outdoor: null, comment: '',
  });
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.equal(validateAnswers({ ...good(), stress: 9 }).ok, false);
  assert.equal(validateAnswers({ ...good(), desire: 'nager' }).ok, false);
  assert.equal(validateAnswers({ ...good(), comment: 'x'.repeat(1000) }).ok, false);
});

test('la normalisation ne mute jamais l’objet reçu', () => {
  const source = good();
  const copy = structuredClone(source);
  normalizeAnswers(source);
  validateAnswers(source);
  assert.deepEqual(source, copy);
});

/* ── Entrée d’historique ────────────────────────────────────────────────── */

const recommendation = {
  status: 'ADAPT',
  reasons: [{ code: 'time-short', text: 'Temps réduit' }],
  proposedAction: 'shorten',
};
const context = { plannedSessionId: 'plan-2026-09-14', plannedDurationMinutes: 60, freshness: -8 };

test('une entrée porte sa version, sa date, son horodatage et ce qui a servi à décider', () => {
  const entry = createEntry({
    date: '2026-09-14', answers: good(), context, recommendation, now: '2026-09-14T06:45:00.000Z',
  });
  assert.equal(entry.version, CHECKIN_VERSION);
  assert.equal(entry.date, '2026-09-14');
  assert.equal(entry.updatedAt, '2026-09-14T06:45:00.000Z');
  assert.equal(entry.createdAt, '2026-09-14T06:45:00.000Z');
  assert.deepEqual(entry.context, context);
  assert.equal(entry.recommendation.status, 'ADAPT');
  assert.equal(entry.userDecision, null);
  assert.deepEqual(entry.revisions, []);
});

test('modifier ses réponses archive la recommandation précédente sans la réécrire', () => {
  const first = createEntry({
    date: '2026-09-14', answers: good(), context, recommendation, now: '2026-09-14T06:45:00.000Z',
  });
  const second = reviseEntry(first, {
    answers: { ...good(), fatigue: 5 },
    context: { ...context, freshness: -30 },
    recommendation: { status: 'RECOVER', reasons: [], proposedAction: 'recover' },
    now: '2026-09-14T18:00:00.000Z',
  });

  assert.equal(second.recommendation.status, 'RECOVER');
  assert.equal(second.updatedAt, '2026-09-14T18:00:00.000Z');
  assert.equal(second.createdAt, '2026-09-14T06:45:00.000Z');
  assert.equal(second.revisions.length, 1);
  assert.equal(second.revisions[0].recommendation.status, 'ADAPT');
  assert.equal(second.revisions[0].context.freshness, -8);
  // L'entrée d'origine n'a pas bougé.
  assert.equal(first.recommendation.status, 'ADAPT');
  assert.equal(first.revisions.length, 0);
});

test('la décision de l’utilisateur s’ajoute sans toucher à la recommandation', () => {
  const entry = createEntry({
    date: '2026-09-14', answers: good(), context, recommendation, now: '2026-09-14T06:45:00.000Z',
  });
  const decided = decideEntry(entry, { action: 'keep' }, '2026-09-14T07:00:00.000Z');
  assert.equal(decided.userDecision.action, 'keep');
  assert.equal(decided.userDecision.at, '2026-09-14T07:00:00.000Z');
  assert.equal(decided.recommendation.status, 'ADAPT');
  assert.equal(entry.userDecision, null);
});

test('la séance réellement faite se rattache sans retoucher la recommandation', () => {
  const entry = createEntry({ date: '2026-09-14', answers: good(), context, recommendation });
  const lié = attachCompletedSession(entry, 'a-0914');
  assert.equal(lié.completedSessionId, 'a-0914');
  assert.equal(lié.recommendation.status, 'ADAPT');
  assert.deepEqual(lié.context, context);
  assert.equal(entry.completedSessionId, null);
});

/* ── Persistance ────────────────────────────────────────────────────────── */

test('un questionnaire enregistré se relit à sa date', () => {
  const storage = memoryStorage();
  const entry = createEntry({
    date: '2026-09-14', answers: good(), context, recommendation, now: '2026-09-14T06:45:00.000Z',
  });
  assert.deepEqual(saveCheckinEntry(entry, storage), { ok: true });
  assert.equal(loadCheckinFor('2026-09-14', storage).recommendation.status, 'ADAPT');
  assert.equal(loadCheckinFor('2026-09-13', storage), null);
  assert.equal(Object.keys(loadCheckinHistory(storage)).length, 1);
});

test('la clé de stockage est versionnée et l’historique se supprime', () => {
  assert.match(CHECKIN_STORAGE_KEYS.history, /\.v1$/);
  const storage = memoryStorage();
  saveCheckinEntry(createEntry({ date: '2026-09-14', answers: good(), context, recommendation }), storage);
  clearCheckinHistory(storage);
  assert.deepEqual(loadCheckinHistory(storage), {});
});

test('des données locales invalides ne font pas planter la lecture', () => {
  const cassés = [
    '{{{', 'null', '[]', '{"version":99,"data":{}}', '{"version":1,"data":[1,2]}',
    '{"version":1,"data":{"2026-09-14":{"date":"nope"}}}',
  ];
  for (const brut of cassés) {
    const storage = memoryStorage({ [CHECKIN_STORAGE_KEYS.history]: brut });
    assert.deepEqual(loadCheckinHistory(storage), {}, brut);
    assert.equal(loadCheckinFor('2026-09-14', storage), null, brut);
  }
});

test('une entrée invalide au milieu d’un historique valide est écartée, pas le reste', () => {
  const valide = createEntry({ date: '2026-09-13', answers: good(), context, recommendation });
  const storage = memoryStorage({
    [CHECKIN_STORAGE_KEYS.history]: JSON.stringify({
      version: 1,
      data: {
        '2026-09-13': valide,
        '2026-09-14': { version: 1, date: '2026-09-14', answers: { fatigue: 99 } },
      },
    }),
  });
  const history = loadCheckinHistory(storage);
  assert.ok(history['2026-09-13']);
  assert.equal(history['2026-09-14'], undefined);
});

test('un stockage qui refuse d’écrire renvoie une erreur lisible, sans exception', () => {
  const entry = createEntry({ date: '2026-09-14', answers: good(), context, recommendation });
  const res = saveCheckinEntry(entry, failingStorage());
  assert.equal(res.ok, false);
  assert.match(res.reason, /questionnaire/i);
  assert.equal(saveCheckinEntry(entry, null).ok, false);
  assert.deepEqual(loadCheckinHistory(null), {});
});

test('le brouillon conserve les réponses en cours et l’étape atteinte', () => {
  const storage = memoryStorage();
  assert.equal(loadCheckinDraft('2026-09-14', storage), null);
  saveCheckinDraft({ date: '2026-09-14', step: 3, answers: { ...emptyAnswers(), fatigue: 4 } }, storage);

  const draft = loadCheckinDraft('2026-09-14', storage);
  assert.equal(draft.step, 3);
  assert.equal(draft.answers.fatigue, 4);
  assert.ok(draft.updatedAt);

  // Un brouillon d'hier ne reprend pas le questionnaire d'aujourd'hui.
  assert.equal(loadCheckinDraft('2026-09-15', storage), null);
  clearCheckinDraft(storage);
  assert.equal(loadCheckinDraft('2026-09-14', storage), null);
});

test('un brouillon illisible est ignoré', () => {
  const storage = memoryStorage({ [CHECKIN_STORAGE_KEYS.draft]: '{"version":1,"data":{"step":"trois"}}' });
  assert.equal(loadCheckinDraft('2026-09-14', storage), null);
});

test('l’historique est plafonné pour ne pas remplir le stockage', () => {
  const storage = memoryStorage();
  const start = new Date(Date.UTC(2025, 0, 1));
  for (let i = 0; i < 200; i += 1) {
    const day = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
    saveCheckinEntry(createEntry({
      date: day, answers: good(), context, recommendation, now: `${day}T06:00:00.000Z`,
    }), storage);
  }
  const history = loadCheckinHistory(storage);
  const dates = Object.keys(history);
  assert.ok(dates.length <= 120, `${dates.length} entrées conservées`);
  // Ce sont les plus récentes qui restent.
  assert.ok(history[dates.sort().at(-1)]);
  assert.equal(history['2025-01-01'], undefined);
});
