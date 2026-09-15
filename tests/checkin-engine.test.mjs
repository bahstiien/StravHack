// Le moteur de décision, règle par règle.
//
// Aucune de ces vérifications ne touche à React, au stockage ou à la Coros :
// le moteur reçoit des réponses et un contexte, il renvoie un statut, des
// raisons et des effets. C'est ce qui rend chaque règle éprouvable seule, et
// c'est aussi ce qui garantit qu'une recommandation est reproductible — la
// même journée donne deux fois la même réponse.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STATUS, STATUS_LABELS, RULE_CODES, evaluateCheckin, compareStatus,
} from '../src/data/checkin-engine.js';
import { buildCheckinContext, sessionTargetAreas } from '../src/data/checkin-context.js';
import { summaryLines, summaryText, explain } from '../src/data/checkin-explain.js';
import { normalizeAnswers } from '../src/data/checkin-model.js';

/** Une journée où tout va bien, et une séance de 60 minutes en face. */
const jourFavorable = () => normalizeAnswers({
  availableMinutes: 60,
  fatigue: 2,
  sleepQuality: 4,
  sleepMinutes: 450,
  soreness: { level: 'none', areas: [] },
  motivation: 4,
  pain: { present: false },
  stress: 2,
  legs: 4,
  desire: 'run',
  availableEquipment: ['poids-du-corps', 'halteres'],
  outdoor: true,
  comment: '',
});

const contexteFavorable = () => ({
  date: '2026-09-14',
  plannedSessionId: 'plan-2026-09-14',
  plannedTitle: 'PPG force + pliométrie',
  plannedType: 'PPG',
  plannedIntensity: 'ppg',
  plannedDurationMinutes: 60,
  plannedTargets: ['quadriceps', 'glutes'],
  plannedHasPlyo: true,
  sessionLocked: false,
  sessionStatus: 'PROPOSÉE',
  freshness: 4,
  ratio: 0.78,
  recentLoad: 120,
  recentLoadBaseline: 130,
  restingHeartRate: 50,
  restingHeartRateBaseline: 51,
  clubInDays: 5,
  longRunInDays: 6,
  phase: 'développement',
  phaseLabel: 'Développement',
  hasCorosData: true,
});

const evaluate = (answers = {}, context = {}) => evaluateCheckin(
  normalizeAnswers({ ...jourFavorable(), ...answers }),
  { ...contexteFavorable(), ...context },
);

const codes = (res) => res.reasons.map((r) => r.code);

/* ── Le socle ───────────────────────────────────────────────────────────── */

test('les six recommandations attendues existent et sont libellées en français', () => {
  assert.equal(STATUS_LABELS[STATUS.KEEP], 'SÉANCE MAINTENUE');
  assert.equal(STATUS_LABELS[STATUS.SHORTEN], 'SÉANCE À RACCOURCIR');
  assert.equal(STATUS_LABELS[STATUS.ADAPT], 'SÉANCE À ADAPTER');
  assert.equal(STATUS_LABELS[STATUS.MOVE], 'SÉANCE À DÉPLACER');
  assert.equal(STATUS_LABELS[STATUS.RECOVER], 'RÉCUPÉRATION CONSEILLÉE');
  assert.equal(STATUS_LABELS[STATUS.MEDICAL], 'AVIS PROFESSIONNEL CONSEILLÉ');
});

test('la gravité est ordonnée, du maintien à l’avis professionnel', () => {
  assert.ok(compareStatus(STATUS.MEDICAL, STATUS.RECOVER) > 0);
  assert.ok(compareStatus(STATUS.RECOVER, STATUS.MOVE) > 0);
  assert.ok(compareStatus(STATUS.MOVE, STATUS.ADAPT) > 0);
  assert.ok(compareStatus(STATUS.ADAPT, STATUS.SHORTEN) > 0);
  assert.ok(compareStatus(STATUS.SHORTEN, STATUS.KEEP) > 0);
});

test('le moteur est déterministe : deux appels identiques donnent le même résultat', () => {
  const a = evaluate({ fatigue: 4, sleepQuality: 2 });
  const b = evaluate({ fatigue: 4, sleepQuality: 2 });
  assert.deepEqual(a, b);
});

test('le moteur ne mute ni les réponses ni le contexte', () => {
  const answers = jourFavorable();
  const context = contexteFavorable();
  const copieA = structuredClone(answers);
  const copieC = structuredClone(context);
  evaluateCheckin(answers, context);
  assert.deepEqual(answers, copieA);
  assert.deepEqual(context, copieC);
});

test('toute recommandation est expliquée par au moins un élément observable', () => {
  for (const answers of [{}, { fatigue: 5, sleepQuality: 1 }, { availableMinutes: 20 },
    { pain: { present: true, area: 'knees', intensity: 3, moments: ['running'] } },
    { availableMinutes: 0 }]) {
    const res = evaluate(answers);
    assert.ok(res.reasons.length > 0, JSON.stringify(answers));
    for (const reason of res.reasons) {
      assert.ok(reason.code && reason.text, 'chaque raison porte un code stable et un texte');
      assert.ok(reason.text.length > 10);
    }
  }
});

/* ── Journée favorable ──────────────────────────────────────────────────── */

test('tous les indicateurs favorables : la séance est maintenue', () => {
  const res = evaluate();
  assert.equal(res.status, STATUS.KEEP);
  assert.equal(res.proposedAction, 'keep');
  assert.equal(res.effects.shorten, false);
  assert.deepEqual(res.effects.avoidAreas, []);
  assert.equal(res.score, 0);
});

/* ── Temps disponible ───────────────────────────────────────────────────── */

test('le temps disponible couvre la séance : il ne la modifie pas', () => {
  assert.equal(evaluate({ availableMinutes: 90 }, { plannedDurationMinutes: 60 }).status, STATUS.KEEP);
  assert.equal(evaluate({ availableMinutes: 60 }, { plannedDurationMinutes: 60 }).status, STATUS.KEEP);
});

test('moins de temps que prévu : séance à raccourcir, avec les deux durées citées', () => {
  const res = evaluate({ availableMinutes: 40 }, { plannedDurationMinutes: 60 });
  assert.equal(res.status, STATUS.SHORTEN);
  assert.ok(codes(res).includes(RULE_CODES.TIME_SHORT));
  assert.match(res.reasons.find((r) => r.code === RULE_CODES.TIME_SHORT).text, /40/);
  assert.match(res.reasons.find((r) => r.code === RULE_CODES.TIME_SHORT).text, /60/);
  assert.equal(res.effects.shorten, true);
  assert.equal(res.effects.targetMinutes, 40);
});

test('beaucoup moins de temps que prévu : le déplacement est proposé', () => {
  const res = evaluate({ availableMinutes: 20 }, { plannedDurationMinutes: 60 });
  assert.equal(res.status, STATUS.MOVE);
  assert.equal(res.effects.move, true);
});

test('indisponible : la séance est à déplacer, jamais supprimée en silence', () => {
  const res = evaluate({ availableMinutes: 0 });
  assert.equal(res.status, STATUS.MOVE);
  assert.equal(res.proposedAction, 'move');
  assert.ok(codes(res).includes(RULE_CODES.TIME_UNAVAILABLE));
  assert.equal(res.effects.cancel, undefined, 'aucun effet ne supprime la séance');
});

/* ── Fatigue et sommeil ─────────────────────────────────────────────────── */

test('une mauvaise nuit isolée n’annule pas la séance', () => {
  const res = evaluate({ sleepQuality: 1 });
  assert.ok(compareStatus(res.status, STATUS.SHORTEN) <= 0, `statut ${res.status}`);
  assert.ok(codes(res).includes(RULE_CODES.SLEEP_POOR));
  assert.ok(compareStatus(res.status, STATUS.RECOVER) < 0);
});

test('fatigue élevée et mauvais sommeil ensemble : avertissement significatif', () => {
  const res = evaluate({ fatigue: 4, sleepQuality: 2 });
  assert.equal(res.status, STATUS.ADAPT);
  assert.ok(codes(res).includes(RULE_CODES.FATIGUE_SLEEP));
  assert.match(
    res.reasons.find((r) => r.code === RULE_CODES.FATIGUE_SLEEP).text,
    /fatigue|sommeil/i,
  );
});

test('plusieurs signaux défavorables pèsent plus qu’un seul', () => {
  const seul = evaluate({ fatigue: 4 });
  const cumul = evaluate({
    fatigue: 5, sleepQuality: 1, stress: 5, legs: 1,
    soreness: { level: 'heavy', areas: ['quadriceps'] },
  }, { freshness: -42, restingHeartRate: 60, restingHeartRateBaseline: 51 });
  assert.ok(cumul.score > seul.score);
  assert.equal(cumul.status, STATUS.RECOVER);
  assert.equal(cumul.proposedAction, 'recover');
});

/* ── Courbatures ────────────────────────────────────────────────────────── */

test('des courbatures légères n’empêchent pas de s’entraîner', () => {
  const res = evaluate({ soreness: { level: 'light', areas: ['calves'] } });
  assert.equal(res.status, STATUS.KEEP);
  assert.ok(codes(res).includes(RULE_CODES.SORENESS));
});

test('des courbatures importantes sur la zone ciblée par la séance : séance à adapter', () => {
  const res = evaluate(
    { soreness: { level: 'heavy', areas: ['quadriceps'] } },
    { plannedTargets: ['quadriceps', 'glutes'] },
  );
  assert.equal(res.status, STATUS.ADAPT);
  assert.ok(codes(res).includes(RULE_CODES.SORENESS_TARGETED));
  assert.deepEqual(res.effects.avoidAreas, ['quadriceps']);
  assert.equal(res.effects.removePlyo, true);
  assert.equal(res.effects.substitute, true);
});

test('des courbatures importantes ailleurs restent un signal, pas un blocage de la séance', () => {
  const res = evaluate(
    { soreness: { level: 'heavy', areas: ['shoulders'] } },
    { plannedTargets: ['quadriceps'] },
  );
  assert.ok(compareStatus(res.status, STATUS.ADAPT) < 0);
  assert.deepEqual(res.effects.avoidAreas, ['shoulders']);
});

/* ── Douleur ────────────────────────────────────────────────────────────── */

test('une douleur inhabituelle est toujours visible dans la recommandation', () => {
  const res = evaluate({
    pain: { present: true, area: 'knees', intensity: 3, moments: ['running'], triggers: ['descente'] },
  });
  assert.ok(compareStatus(res.status, STATUS.ADAPT) >= 0);
  const raison = res.reasons.find((r) => r.code === RULE_CODES.PAIN);
  assert.ok(raison, 'la douleur doit apparaître dans les raisons');
  assert.match(raison.text, /genou/i);
  assert.ok(res.effects.avoidAreas.includes('knees'));
  assert.deepEqual(res.effects.forbiddenMovements, ['descente']);
});

test('la douleur est distinguée des courbatures', () => {
  const res = evaluate({
    soreness: { level: 'moderate', areas: ['calves'] },
    pain: { present: true, area: 'knees', intensity: 3, moments: ['running'] },
  });
  const painCodes = codes(res);
  assert.ok(painCodes.includes(RULE_CODES.PAIN));
  assert.ok(painCodes.includes(RULE_CODES.SORENESS));
  const douleur = res.reasons.find((r) => r.code === RULE_CODES.PAIN).text;
  assert.ok(!/courbature/i.test(douleur));
});

test('une douleur intense déclenche un message prudent, sans diagnostic', () => {
  const res = evaluate({ pain: { present: true, area: 'knees', intensity: 8, moments: ['movement'] } });
  assert.equal(res.status, STATUS.MEDICAL);
  assert.equal(res.proposedAction, 'seek-advice');
  const texte = res.reasons.map((r) => r.text).join(' ');
  assert.ok(!/tendinite|fracture|entorse|syndrome/i.test(texte), 'aucun diagnostic');
});

test('une douleur au repos ou invalidante déclenche le même message prudent', () => {
  assert.equal(
    evaluate({ pain: { present: true, area: 'back', intensity: 3, moments: ['rest'] } }).status,
    STATUS.MEDICAL,
  );
  assert.equal(
    evaluate({ pain: { present: true, area: 'back', intensity: 3, moments: ['movement'], limiting: true } }).status,
    STATUS.MEDICAL,
  );
});

/* ── Motivation ─────────────────────────────────────────────────────────── */

test('une motivation faible isolée propose une séance courte, pas du repos', () => {
  const res = evaluate({ motivation: 1 });
  assert.equal(res.status, STATUS.SHORTEN);
  assert.ok(codes(res).includes(RULE_CODES.MOTIVATION_LOW));
  assert.notEqual(res.status, STATUS.RECOVER);
});

test('une forte motivation n’efface pas un avertissement de douleur', () => {
  const res = evaluate({
    motivation: 5,
    pain: { present: true, area: 'ankles-feet', intensity: 9, moments: ['movement'] },
  });
  assert.equal(res.status, STATUS.MEDICAL);
});

test('une forte motivation n’efface pas une récupération très dégradée', () => {
  const res = evaluate({
    motivation: 5, fatigue: 5, sleepQuality: 1, stress: 5, legs: 1,
    soreness: { level: 'heavy', areas: ['quadriceps'] },
  }, { freshness: -45, restingHeartRate: 61, restingHeartRateBaseline: 51 });
  assert.equal(res.status, STATUS.RECOVER);
});

/* ── Données Coros ──────────────────────────────────────────────────────── */

test('sans données Coros, la recommandation le dit et repose sur le déclaratif', () => {
  const res = evaluate({ fatigue: 4 }, {
    hasCorosData: false, freshness: null, ratio: null,
    restingHeartRate: null, restingHeartRateBaseline: null, recentLoad: null,
  });
  assert.equal(res.usedCoros, false);
  assert.match(res.dataNote, /déclarat/i);
  assert.ok(res.reasons.length > 0);
});

test('avec données Coros, la fraîcheur et la FC de repos entrent dans la décision', () => {
  const res = evaluate({}, {
    freshness: -38, ratio: 1.35, restingHeartRate: 59, restingHeartRateBaseline: 51,
  });
  assert.equal(res.usedCoros, true);
  const list = codes(res);
  assert.ok(list.includes(RULE_CODES.FRESHNESS_LOW));
  assert.ok(list.includes(RULE_CODES.RATIO_HIGH));
  assert.ok(list.includes(RULE_CODES.RESTING_HR_HIGH));
  assert.ok(res.score >= 3);
});

test('une charge des trois derniers jours très supérieure à l’habitude compte', () => {
  const res = evaluate({}, { recentLoad: 320, recentLoadBaseline: 130 });
  assert.ok(codes(res).includes(RULE_CODES.RECENT_LOAD_HIGH));
});

/* ── Contexte du plan ───────────────────────────────────────────────────── */

test('la veille du club ou de la sortie longue, une PPG jambes fatiguée est adaptée', () => {
  const res = evaluate(
    { fatigue: 4, soreness: { level: 'moderate', areas: ['quadriceps'] } },
    { clubInDays: 1 },
  );
  assert.ok(compareStatus(res.status, STATUS.ADAPT) >= 0);
  assert.ok(codes(res).includes(RULE_CODES.NEXT_DAY_KEY_SESSION));
  assert.equal(res.effects.removePlyo, true);
});

test('en affûtage, un signal défavorable pèse un peu plus', () => {
  const normal = evaluate({ fatigue: 4 }, { phase: 'développement' });
  const affutage = evaluate({ fatigue: 4 }, { phase: 'affûtage', phaseLabel: 'Affûtage' });
  assert.ok(affutage.score > normal.score);
  assert.ok(codes(affutage).includes(RULE_CODES.TAPER_PHASE));
});

test('aucune séance prévue : le moteur le dit au lieu de maintenir une séance inexistante', () => {
  const res = evaluate({}, {
    plannedSessionId: null, plannedTitle: null, plannedDurationMinutes: null, plannedTargets: [],
  });
  assert.equal(res.status, STATUS.NO_SESSION);
  assert.equal(STATUS_LABELS[STATUS.NO_SESSION], 'AUCUNE SÉANCE PRÉVUE');
  assert.equal(res.proposedAction, 'none');
});

test('aucune séance prévue mais des signaux très dégradés : la récupération reste conseillée', () => {
  const res = evaluate(
    { fatigue: 5, sleepQuality: 1, soreness: { level: 'heavy', areas: ['calves'] }, stress: 5, legs: 1 },
    { plannedSessionId: null, plannedDurationMinutes: null, plannedTargets: [], freshness: -45 },
  );
  assert.equal(res.status, STATUS.RECOVER);
});

/* ── Le contexte, construit depuis le snapshot ──────────────────────────── */

const snapshot = () => ({
  sessions: [
    { id: 's-11', date: '2026-09-11', type: 'TRAIL', title: 'Seuil', load: 96, done: true },
    { id: 's-12', date: '2026-09-12', type: 'PPG', title: 'PPG', load: 24, done: true },
    { id: 's-13', date: '2026-09-13', type: 'TRAIL', title: 'Footing', load: 60, done: true },
    {
      id: 'plan-2026-09-14', date: '2026-09-14', type: 'PPG', title: 'PPG force + pliométrie',
      load: 24, planned: true, durationSec: 3600, intensity: 'ppg', status: 'PROPOSÉE',
      ppgExercises: [
        { id: 'a', cat: 'FORCE', target: 'quads', name: 'Fente bulgare' },
        { id: 'b', cat: 'PLIOMÉTRIE', target: 'calves', name: 'Sauts de haies' },
      ],
      phase: 'développement', phaseLabel: 'Développement',
    },
    { id: 'plan-2026-09-15', date: '2026-09-15', type: 'TRAIL', title: 'Club', load: 200, planned: true, isClub: true },
    { id: 'plan-2026-09-20', date: '2026-09-20', type: 'TRAIL', title: 'Sortie longue 2h', load: 240, planned: true, isLongRun: true },
  ],
  load: [{ date: '2026-09-14', ratio: 0.78 }],
  restingHr: [
    { date: '2026-09-14', bpm: 55 }, { date: '2026-09-13', bpm: 50 }, { date: '2026-09-12', bpm: 51 },
    { date: '2026-09-11', bpm: 49 }, { date: '2026-09-10', bpm: 52 }, { date: '2026-09-09', bpm: 50 },
    { date: '2026-09-08', bpm: 51 }, { date: '2026-09-07', bpm: 50 },
  ],
});

test('le contexte reprend la séance du jour, la charge récente et les repères Coros', () => {
  const ctx = buildCheckinContext({ snapshot: snapshot(), date: '2026-09-14' });
  assert.equal(ctx.plannedSessionId, 'plan-2026-09-14');
  assert.equal(ctx.plannedDurationMinutes, 60);
  assert.equal(ctx.plannedType, 'PPG');
  assert.equal(ctx.plannedHasPlyo, true);
  assert.deepEqual(ctx.plannedTargets.sort(), ['calves', 'quadriceps']);
  assert.equal(ctx.recentLoad, 180, 'les trois jours précédents');
  assert.equal(ctx.ratio, 0.78);
  assert.equal(ctx.restingHeartRate, 55);
  assert.ok(ctx.restingHeartRateBaseline >= 49 && ctx.restingHeartRateBaseline <= 52);
  assert.equal(ctx.clubInDays, 1);
  assert.equal(ctx.longRunInDays, 6);
  assert.equal(ctx.hasCorosData, true);
  assert.equal(typeof ctx.freshness, 'number');
});

test('le contexte tient debout sans aucune donnée Coros', () => {
  const ctx = buildCheckinContext({ snapshot: { sessions: [] }, date: '2026-09-14' });
  assert.equal(ctx.hasCorosData, false);
  assert.equal(ctx.plannedSessionId, null);
  assert.equal(ctx.ratio, null);
  assert.equal(ctx.restingHeartRate, null);
  assert.equal(ctx.recentLoad, 0);
  assert.doesNotThrow(() => evaluateCheckin(jourFavorable(), ctx));
});

test('une séance validée est signalée comme verrouillée dans le contexte', () => {
  const data = snapshot();
  data.sessions[3] = { ...data.sessions[3], status: 'VALIDÉE', locked: true };
  const ctx = buildCheckinContext({ snapshot: data, date: '2026-09-14' });
  assert.equal(ctx.sessionLocked, true);
  assert.equal(ctx.sessionStatus, 'VALIDÉE');
});

test('les zones ciblées par une séance se déduisent de son contenu', () => {
  assert.deepEqual(
    sessionTargetAreas({
      type: 'PPG',
      ppgExercises: [{ target: 'quads' }, { target: 'spine' }],
    }).sort(),
    ['back', 'quadriceps'],
  );
  const trail = sessionTargetAreas({ type: 'TRAIL', title: 'Sortie longue' });
  assert.ok(trail.includes('calves'));
  assert.ok(trail.includes('quadriceps'));
  assert.deepEqual(sessionTargetAreas(null), []);
});

/* ── Les explications ───────────────────────────────────────────────────── */

test('la synthèse reprend les six lignes attendues, en français', () => {
  const answers = normalizeAnswers({
    ...jourFavorable(),
    availableMinutes: 40, fatigue: 3, sleepQuality: 4, motivation: 4,
    soreness: { level: 'light', areas: ['calves'] },
  });
  const lignes = summaryLines(answers);
  assert.deepEqual(lignes.map((l) => l.label), ['Temps', 'Fatigue', 'Sommeil', 'Jambes', 'Motivation', 'Douleur']);
  assert.equal(lignes[0].value, '40 min');
  assert.equal(lignes[1].value, 'moyenne');
  // La durée de sommeil, quand elle est connue, complète la qualité.
  assert.match(lignes[2].value, /^bon/);
  assert.match(lignes[2].value, /7 h 30/);
  assert.equal(
    summaryLines({ ...answers, sleepMinutes: null })[2].value, 'bon',
    'sans durée renseignée, la ligne se limite à la qualité',
  );
  assert.match(lignes[3].value, /courbatures légères aux mollets/i);
  assert.equal(lignes[4].value, 'bonne');
  assert.equal(lignes[5].value, 'aucune');

  const texte = summaryText(answers);
  assert.match(texte, /^DISPONIBILITÉ DU JOUR/);
  assert.match(texte, /Temps : 40 min/);
});

test('la synthèse dit l’indisponibilité plutôt qu’un « 0 min »', () => {
  const lignes = summaryLines(normalizeAnswers({ ...jourFavorable(), availableMinutes: 0 }));
  assert.match(lignes[0].value, /indisponible/i);
});

test('l’explication cite les éléments observables et propose une conduite', () => {
  const answers = normalizeAnswers({
    ...jourFavorable(), availableMinutes: 40, soreness: { level: 'light', areas: ['calves'] },
  });
  const res = evaluateCheckin(answers, { ...contexteFavorable(), plannedDurationMinutes: 60 });
  const texte = explain(res, { answers, context: contexteFavorable() });
  assert.equal(texte.title, STATUS_LABELS[res.status]);
  assert.ok(texte.paragraph.length > 40);
  assert.match(texte.paragraph, /40/);
  assert.ok(texte.bullets.length >= 1);
  // Jamais une note ni une couleur seule.
  assert.ok(!/^\d+\/\d+$/.test(texte.paragraph.trim()));
});

test('l’explication reste prudente et sans diagnostic sur une douleur', () => {
  const answers = normalizeAnswers({
    ...jourFavorable(),
    pain: { present: true, area: 'knees', intensity: 8, moments: ['rest'] },
  });
  const res = evaluateCheckin(answers, contexteFavorable());
  const texte = explain(res, { answers, context: contexteFavorable() });
  assert.match(texte.paragraph, /avis|professionnel|santé/i);
  assert.ok(!/diagnostic|tendinite|fracture/i.test(texte.paragraph));
});

test('chaque recommandation possible reçoit une conduite à tenir qui lui est propre', () => {
  const cas = [
    [STATUS.KEEP, {}, {}],
    [STATUS.SHORTEN, { availableMinutes: 40 }, {}],
    [STATUS.ADAPT, { fatigue: 4, sleepQuality: 2, soreness: { level: 'heavy', areas: ['quadriceps'] } }, {}],
    [STATUS.MOVE, { availableMinutes: 0 }, {}],
    [STATUS.RECOVER, {
      fatigue: 5, sleepQuality: 1, stress: 5, legs: 1,
      soreness: { level: 'heavy', areas: ['quadriceps'] },
    }, { freshness: -45 }],
    [STATUS.MEDICAL, { pain: { present: true, area: 'knees', intensity: 9, moments: ['rest'] } }, {}],
    [STATUS.NO_SESSION, {}, { plannedSessionId: null, plannedTitle: null, plannedDurationMinutes: null }],
  ];

  const vues = new Set();
  for (const [attendu, reponses, contexte] of cas) {
    const answers = normalizeAnswers({ ...jourFavorable(), ...reponses });
    const context = { ...contexteFavorable(), ...contexte };
    const res = evaluateCheckin(answers, context);
    assert.equal(res.status, attendu, `${attendu} attendu, ${res.status} obtenu`);

    const texte = explain(res, { answers, context });
    assert.equal(texte.title, STATUS_LABELS[attendu]);
    assert.ok(texte.opening.length > 10, `${attendu} sans phrase d’ouverture`);
    assert.ok(texte.paragraph.length > texte.opening.length, `${attendu} sans conduite à tenir`);
    assert.ok(texte.bullets.length >= 1, `${attendu} sans élément observable`);
    assert.ok(texte.note.length > 10);
    // Deux recommandations différentes ne disent pas la même chose.
    assert.ok(!vues.has(texte.paragraph), `${attendu} répète une autre explication`);
    vues.add(texte.paragraph);
  }
});

test('la synthèse dit l’heure de sommeil et les zones, ou se tait proprement', () => {
  const minimal = normalizeAnswers({
    availableMinutes: 90, fatigue: 1, sleepQuality: 5, motivation: 5,
    soreness: { level: 'none', areas: [] }, pain: { present: false },
  });
  const lignes = summaryLines(minimal);
  assert.equal(lignes[0].value, '1 h 30');
  assert.equal(lignes[3].value, 'rien à signaler');
  assert.equal(lignes[5].value, 'aucune');

  const douloureux = normalizeAnswers({
    ...minimal,
    pain: { present: true, area: 'knees', intensity: 6, moments: ['running'] },
  });
  assert.match(summaryLines(douloureux)[5].value, /genoux 6\/10, en courant/);
  assert.match(summaryText(douloureux), /Douleur : genoux/);
});
