// L'interface du questionnaire, et le parcours quotidien de bout en bout.
//
// Les écrans sont rendus en chaîne avec react-dom/server : pas de clic, mais
// chaque état s'obtient en passant l'étape et les réponses correspondantes —
// ce que permet un moteur séparé de l'interface. Le parcours complet, lui,
// traverse les vrais modules : contexte, moteur, adaptation, stockage,
// décision de planning.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

import { buildCheckinContext } from '../src/data/checkin-context.js';
import { evaluateCheckin, STATUS, STATUS_LABELS } from '../src/data/checkin-engine.js';
import { adaptSession } from '../src/data/checkin-adapt.js';
import { createEntry, decideEntry, normalizeAnswers, emptyAnswers } from '../src/data/checkin-model.js';
import { saveCheckinEntry, loadCheckinFor, saveCheckinDraft, loadCheckinDraft } from '../src/data/checkin-store.js';
import { memoryStorage } from '../src/data/workout-store.js';
import { modifySession } from '../src/data/planning-decisions.js';
import { applyDecisionLayer } from '../src/data/planning-conflicts.js';

const root = resolve(import.meta.dirname, '..');

async function compile(entry) {
  const cache = join(root, '.cache');
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, 'checkin-ui-'));
  const outfile = join(dir, 'bundle.mjs');
  const sourcefile = join(root, entry);
  await build({
    absWorkingDir: root,
    stdin: {
      contents: readFileSync(sourcefile, 'utf8'), resolveDir: dirname(sourcefile),
      sourcefile, loader: 'jsx',
    },
    bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile,
    external: ['react', 'react-dom', 'react/jsx-runtime'], logLevel: 'silent',
  });
  const module = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  rmSync(dir, { recursive: true, force: true });
  return module;
}

const { default: DailyCheckin, CHECKIN_STEPS } = await compile('src/components/DailyCheckin.jsx');
const { default: CheckinCard, CheckinResult } = await compile('src/components/CheckinCard.jsx');
const { default: WeekScreen } = await compile('src/screens/WeekScreen.jsx');
const { default: SessionScreen } = await compile('src/screens/SessionScreen.jsx');

const text = (markup) => markup
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;/g, '’').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&[^;]+;/g, ' ')
  .replace(/\s+/g, ' ');

const answers = (over = {}) => normalizeAnswers({
  availableMinutes: 40, fatigue: 3, sleepQuality: 4, motivation: 4,
  soreness: { level: 'light', areas: ['calves'] }, pain: { present: false },
  availableEquipment: ['poids-du-corps'], comment: '', ...over,
});

const renderCheckin = (props = {}) => renderToStaticMarkup(createElement(DailyCheckin, {
  date: '2026-09-14',
  initialAnswers: answers(),
  initialStep: 0,
  onChange() {}, onValidate() {}, onClose() {},
  ...props,
}));

/* ── Le parcours ────────────────────────────────────────────────────────── */

test('le questionnaire couvre les six questions obligatoires, dans un parcours court', () => {
  const ids = CHECKIN_STEPS.map((s) => s.id);
  for (const required of ['time', 'fatigue', 'sleep', 'soreness', 'motivation', 'pain']) {
    assert.ok(ids.includes(required), `étape ${required} absente`);
  }
  assert.ok(CHECKIN_STEPS.length <= 8, 'le parcours reste court');
  assert.equal(ids.at(-1), 'review');
});

test('chaque étape annonce sa progression et ne montre qu’un groupe de questions', () => {
  CHECKIN_STEPS.forEach((step, index) => {
    const markup = renderCheckin({ initialStep: index });
    const t = text(markup);
    assert.ok(
      t.includes(`ÉTAPE ${index + 1} SUR ${CHECKIN_STEPS.length}`),
      `étape ${step.id} : progression absente — ${t.slice(0, 120)}`,
    );
    assert.match(markup, /role="dialog"/);
    assert.match(markup, /aria-modal="true"/);
  });
});

test('la première question porte sur le temps réellement disponible', () => {
  const t = text(renderCheckin({ initialStep: 0 }));
  assert.match(t, /Combien de temps as-tu réellement aujourd’hui/);
  for (const label of ['20 min', '30 min', '40 min', '50 min', '60 min', '1 h 30', '2 h', '3 h']) {
    assert.ok(t.includes(label), `${label} manquant`);
  }
  assert.match(t, /Indisponible aujourd’hui/i);
});

test('les échelles de 1 à 5 affichent leur libellé, pas seulement un chiffre', () => {
  const fatigue = text(renderCheckin({ initialStep: CHECKIN_STEPS.findIndex((s) => s.id === 'fatigue') }));
  for (const label of ['très frais', 'plutôt frais', 'moyen', 'fatigué', 'très fatigué']) {
    assert.ok(fatigue.toLowerCase().includes(label), `${label} manquant`);
  }
  const sommeil = text(renderCheckin({ initialStep: CHECKIN_STEPS.findIndex((s) => s.id === 'sleep') }));
  for (const label of ['très mauvaise', 'mauvaise', 'correcte', 'bonne', 'excellente']) {
    assert.ok(sommeil.toLowerCase().includes(label), `${label} manquant`);
  }
});

test('les courbatures proposent leur niveau et les onze zones', () => {
  const t = text(renderCheckin({ initialStep: CHECKIN_STEPS.findIndex((s) => s.id === 'soreness') }));
  for (const label of ['Aucune', 'Légères', 'Modérées', 'Importantes']) assert.ok(t.includes(label), label);
  for (const zone of ['Quadriceps', 'Ischio-jambiers', 'Mollets', 'Fessiers', 'Chevilles',
    'Genoux', 'Hanches', 'Dos', 'Épaules', 'Bras', 'Autre']) {
    assert.ok(t.includes(zone), `zone ${zone} manquante`);
  }
});

test('la question de douleur n’ouvre ses détails que si une douleur est déclarée', () => {
  const index = CHECKIN_STEPS.findIndex((s) => s.id === 'pain');
  const sans = text(renderCheckin({ initialStep: index }));
  assert.match(sans, /As-tu une douleur inhabituelle aujourd’hui/);
  assert.ok(!/intensité/i.test(sans), 'les détails restent cachés tant qu’il n’y a pas de douleur');

  const avec = text(renderCheckin({
    initialStep: index,
    initialAnswers: answers({
      pain: { present: true, area: 'knees', intensity: 5, moments: ['running'], triggers: [] },
    }),
  }));
  assert.match(avec, /intensité/i);
  assert.match(avec, /Au repos/);
  assert.match(avec, /Pendant un mouvement/);
  assert.match(avec, /En courant/);
});

test('les questions facultatives sont regroupées et annoncées comme telles', () => {
  const index = CHECKIN_STEPS.findIndex((s) => s.id === 'extra');
  assert.ok(index >= 0);
  const t = text(renderCheckin({ initialStep: index }));
  assert.match(t, /facultat/i);
  assert.match(t, /stress/i);
  assert.match(t, /jambes/i);
  assert.match(t, /commentaire/i);
});

test('on peut revenir à la question précédente, sauf sur la première', () => {
  assert.ok(!/PRÉCÉDENT/.test(text(renderCheckin({ initialStep: 0 }))));
  assert.match(text(renderCheckin({ initialStep: 1 })), /PRÉCÉDENT/);
});

test('toute action visible est un vrai bouton, aucun div cliquable', () => {
  for (let i = 0; i < CHECKIN_STEPS.length; i += 1) {
    const markup = renderCheckin({ initialStep: i });
    assert.ok(!/<div[^>]*onclick/i.test(markup), `étape ${i}`);
    assert.match(markup, /<button/);
  }
});

test('les choix ne reposent pas sur la seule couleur : ils portent leur état', () => {
  const markup = renderCheckin({ initialStep: 0 });
  assert.match(markup, /aria-pressed="(true|false)"/);
  assert.match(markup, /aria-pressed="true"/, 'le choix courant est annoncé');
});

test('l’étape de relecture récapitule les réponses avant validation', () => {
  const t = text(renderCheckin({ initialStep: CHECKIN_STEPS.length - 1 }));
  assert.match(t, /DISPONIBILITÉ DU JOUR/);
  assert.match(t, /Temps : 40 min/);
  assert.match(t, /VALIDER/);
});

test('une erreur de sauvegarde est affichée sans bloquer le questionnaire', () => {
  const markup = renderCheckin({ initialStep: 0, saveError: 'Questionnaire non enregistré (QuotaExceededError).' });
  assert.match(markup, /role="alert"/);
  assert.match(text(markup), /non enregistré/);
});

test('un questionnaire incomplet ne peut pas être validé', () => {
  const markup = renderCheckin({
    initialStep: CHECKIN_STEPS.length - 1,
    initialAnswers: emptyAnswers(),
  });
  assert.match(markup, /disabled/);
  assert.match(text(markup), /réponse|complèt/i);
});

/* ── La carte de la semaine et la fiche de séance ───────────────────────── */

test('sans questionnaire, la journée courante invite à faire le point', () => {
  const markup = renderToStaticMarkup(createElement(CheckinCard, {
    date: '2026-09-14', entry: null, onOpen() {},
  }));
  assert.match(text(markup), /FAIRE LE POINT/);
  assert.match(markup, /<button/);
});

test('une fois rempli, la carte montre un résumé compact et l’heure de mise à jour', () => {
  const entry = createEntry({
    date: '2026-09-14',
    answers: answers(),
    context: { plannedDurationMinutes: 60 },
    recommendation: {
      status: STATUS.SHORTEN, reasons: [{ code: 'time-short', text: 'Temps réduit' }],
      proposedAction: 'shorten',
    },
    now: '2026-09-14T06:45:00.000Z',
  });
  const t = text(renderToStaticMarkup(createElement(CheckinCard, {
    date: '2026-09-14', entry, onOpen() {}, onEdit() {},
  })));
  assert.match(t, new RegExp(STATUS_LABELS[STATUS.SHORTEN]));
  assert.match(t, /40 min/);
  assert.match(t, /MODIFIER/);
  assert.match(t, /\d{2}:\d{2}/, 'l’heure de la dernière mise à jour');
});

/* ── Le résultat, l’explication et les quatre actions ───────────────────── */

const session = {
  id: 'plan-2026-09-14', date: '2026-09-14', type: 'PPG', title: 'PPG jambes et pliométrie',
  planned: true, done: false, load: 24, durationSec: 3600, intensity: 'ppg', status: 'PROPOSÉE',
  ppgExercises: [
    { id: 'e1', cat: 'MOBILITÉ', target: 'hamstrings', name: 'Mobilité hanches', sets: '2 × 12', tempo: 'lent' },
    { id: 'e2', cat: 'FORCE', target: 'spine', name: 'Tirage élastique', sets: '4 × 12', tempo: '2–1–2' },
    { id: 'e3', cat: 'FORCE', target: 'quads', name: 'Pompes', sets: '4 × 10', tempo: '2–1–2' },
    { id: 'e4', cat: 'PLIOMÉTRIE', target: 'calves', name: 'Box jumps', sets: '5 × 8', tempo: 'court' },
    { id: 'e5', cat: 'GAINAGE', target: 'abs', name: 'Gainage', sets: '3 × 45″', tempo: 'continu' },
  ],
  steps: [],
};

const contexte = {
  date: '2026-09-14', plannedSessionId: session.id, plannedTitle: session.title,
  plannedType: 'PPG', plannedIntensity: 'ppg', plannedDurationMinutes: 60,
  plannedTargets: ['quadriceps', 'calves'], plannedHasPlyo: true,
  sessionLocked: false, sessionStatus: 'PROPOSÉE',
  freshness: -5, ratio: 0.9, recentLoad: 120, recentLoadBaseline: 130,
  restingHeartRate: 53, restingHeartRateBaseline: 51,
  clubInDays: 4, longRunInDays: 6, phase: 'développement', phaseLabel: 'Développement',
  hasCorosData: true,
};

function resultat(over = {}, ctxOver = {}) {
  const a = answers(over);
  const ctx = { ...contexte, ...ctxOver };
  const recommendation = evaluateCheckin(a, ctx);
  const proposal = adaptSession(session, { answers: a, recommendation, context: ctx });
  const entry = createEntry({
    date: '2026-09-14', answers: a, context: ctx, recommendation, now: '2026-09-14T06:45:00.000Z',
  });
  return { entry, proposal, recommendation };
}

const renderResult = (props) => renderToStaticMarkup(createElement(CheckinResult, {
  session, onApply() {}, onKeep() {}, onMove() {}, onEdit() {}, ...props,
}));

test('le résultat affiche la synthèse, la recommandation et son explication', () => {
  const { entry, proposal } = resultat({ availableMinutes: 40, soreness: { level: 'light', areas: ['calves'] } });
  const t = text(renderResult({ entry, proposal }));
  assert.match(t, /DISPONIBILITÉ DU JOUR/);
  assert.match(t, /Temps : 40 min/);
  assert.match(t, /Motivation : bonne/);
  assert.match(t, /Douleur : aucune/);
  assert.match(t, new RegExp(STATUS_LABELS[entry.recommendation.status]));
  // Jamais un statut seul : l'explication l'accompagne toujours.
  const explication = t.split(STATUS_LABELS[entry.recommendation.status])[1] || '';
  assert.ok(explication.trim().length > 60, 'la recommandation est expliquée');
});

test('l’adaptation montre ce qui est retiré, conservé et ajouté', () => {
  const { entry, proposal } = resultat({
    availableMinutes: 40, soreness: { level: 'heavy', areas: ['calves'] },
  });
  const t = text(renderResult({ entry, proposal }));
  assert.match(t, /SÉANCE ADAPTÉE/);
  assert.match(t, /Avant/);
  assert.match(t, /Après/);
  assert.match(t, /Retiré/);
  assert.match(t, /Box jumps/);
  assert.match(t, /Conservé/);
});

test('les quatre actions sont proposées et sont de vrais boutons', () => {
  const { entry, proposal } = resultat({ availableMinutes: 40 });
  const markup = renderResult({ entry, proposal });
  for (const label of ['APPLIQUER L’ADAPTATION', 'GARDER LA SÉANCE PRÉVUE',
    'DÉPLACER LA SÉANCE', 'MODIFIER MES RÉPONSES']) {
    assert.ok(
      text(markup).includes(label),
      `action « ${label} » absente`,
    );
  }
  assert.ok(!/<div[^>]*onclick/i.test(markup));
});

test('garder la séance prévue reste possible sans blocage de sécurité', () => {
  const { entry, proposal } = resultat({ availableMinutes: 40 });
  const markup = renderResult({ entry, proposal });
  const bouton = markup.match(/<button[^>]*>[^<]*GARDER LA SÉANCE PRÉVUE[^<]*<\/button>/);
  assert.ok(bouton, 'le bouton existe');
  assert.ok(!/disabled/.test(bouton[0]), 'et il est actif');
});

test('une douleur préoccupante retire l’application automatique et parle d’avis professionnel', () => {
  const { entry, proposal } = resultat({
    pain: { present: true, area: 'knees', intensity: 8, moments: ['rest'] },
  });
  const t = text(renderResult({ entry, proposal }));
  assert.match(t, new RegExp(STATUS_LABELS[STATUS.MEDICAL]));
  assert.match(t, /avis/i);
  assert.ok(!t.includes('APPLIQUER L’ADAPTATION'));
});

test('une séance validée affiche l’avertissement et refuse d’être écrasée', () => {
  const { entry, proposal } = resultat(
    { availableMinutes: 30 },
    { sessionLocked: true, sessionStatus: 'VALIDÉE' },
  );
  const markup = renderResult({
    entry, proposal, session: { ...session, status: 'VALIDÉE', locked: true },
  });
  const t = text(markup);
  assert.match(t, /validée/i);
  assert.ok(!t.includes('APPLIQUER L’ADAPTATION'), 'aucune application possible');
  assert.match(t, /GARDER LA SÉANCE PRÉVUE/);
});

test('sans donnée Coros, le résultat dit sur quoi il s’appuie', () => {
  const { entry, proposal } = resultat({}, {
    hasCorosData: false, freshness: null, ratio: null,
    restingHeartRate: null, restingHeartRateBaseline: null, recentLoad: null,
  });
  assert.match(text(renderResult({ entry, proposal })), /déclarat/i);
});

test('sans séance prévue, aucune action de planning n’est proposée', () => {
  const { entry } = resultat({}, {
    plannedSessionId: null, plannedTitle: null, plannedDurationMinutes: null, plannedTargets: [],
  });
  const t = text(renderResult({ entry, proposal: null, session: null }));
  assert.match(t, new RegExp(STATUS_LABELS[STATUS.NO_SESSION]));
  assert.ok(!t.includes('APPLIQUER L’ADAPTATION'));
  assert.ok(!t.includes('DÉPLACER LA SÉANCE'));
});

/* ── Le parcours quotidien, de bout en bout ─────────────────────────────── */

test('parcours complet : brouillon, réponses, recommandation, adaptation, planning', () => {
  const storage = memoryStorage();
  const snapshot = {
    sessions: [
      { id: 's-11', date: '2026-09-11', type: 'TRAIL', title: 'Seuil', load: 96, done: true },
      { id: 's-12', date: '2026-09-12', type: 'PPG', title: 'PPG', load: 24, done: true },
      { id: 's-13', date: '2026-09-13', type: 'TRAIL', title: 'Footing', load: 60, done: true },
      session,
    ],
    load: [{ date: '2026-09-14', ratio: 0.82 }],
    restingHr: [{ date: '2026-09-14', bpm: 52 }, { date: '2026-09-13', bpm: 51 }],
  };

  // 1. Le questionnaire est ouvert, deux réponses sont saisies, l'onglet ferme.
  saveCheckinDraft({ date: '2026-09-14', step: 1, answers: { ...emptyAnswers(), availableMinutes: 40 } }, storage);
  const draft = loadCheckinDraft('2026-09-14', storage);
  assert.equal(draft.answers.availableMinutes, 40);

  // 2. Il est repris et terminé.
  const finales = normalizeAnswers({
    ...draft.answers, fatigue: 3, sleepQuality: 4, motivation: 4,
    soreness: { level: 'light', areas: ['calves'] }, pain: { present: false },
  });
  const ctx = buildCheckinContext({ snapshot, date: '2026-09-14' });
  const recommendation = evaluateCheckin(finales, ctx);
  assert.equal(recommendation.status, STATUS.SHORTEN);

  // 3. La recommandation et son contexte sont conservés.
  const entry = createEntry({
    date: '2026-09-14', answers: finales, context: ctx, recommendation, now: '2026-09-14T06:45:00.000Z',
  });
  assert.equal(saveCheckinEntry(entry, storage).ok, true);

  // 4. L'adaptation est proposée, pas appliquée.
  const proposal = adaptSession(session, { answers: finales, recommendation, context: ctx });
  assert.ok(proposal.applicable);
  const avant = applyDecisionLayer([session], [], []).sessions[0];
  assert.equal(avant.durationSec, 3600);

  // 5. L'utilisateur confirme : la décision passe par le planning existant.
  const decision = modifySession(session, proposal.changes);
  const après = applyDecisionLayer([session], [decision], []).sessions[0];
  assert.equal(après.durationSec, 40 * 60);
  assert.equal(après.status, 'MODIFIÉE');

  // 6. Le choix est mémorisé avec le questionnaire du jour.
  const décidé = decideEntry(entry, { action: 'apply', sessionId: session.id }, '2026-09-14T06:47:00.000Z');
  saveCheckinEntry(décidé, storage);
  const relu = loadCheckinFor('2026-09-14', storage);
  assert.equal(relu.userDecision.action, 'apply');
  assert.equal(relu.recommendation.status, STATUS.SHORTEN);
  assert.equal(relu.context.plannedSessionId, session.id);
});

/* ── L'intégration dans les écrans existants ────────────────────────────── */

const jour = new Date(2026, 8, 14);

const semaine = (props = {}) => renderToStaticMarkup(createElement(WeekScreen, {
  snapshot: {
    sessions: [{ ...session, load: 24, planned: true, meta: '60′ · 24 de charge visée' }],
    activities: [], exercises: [],
  },
  weekOffset: 0,
  onShiftWeek() {},
  onOpenSession() {},
  generating: false,
  today: jour,
  conflicts: [],
  checkin: null,
  onOpenCheckin() {},
  onEditCheckin() {},
  ...props,
}));

test('l’écran Semaine invite à faire le point au niveau de la journée courante', () => {
  const markup = semaine();
  assert.match(text(markup), /FAIRE LE POINT/);
  // Le bouton est à côté de la ligne, pas dedans : imbriquer une action dans
  // une ligne déjà cliquable rendrait les deux inutilisables au clavier.
  assert.ok(!/role="button"[^>]*>(?:(?!<\/div>).)*FAIRE LE POINT/s.test(markup));
});

test('une fois rempli, l’écran Semaine montre le résumé et non l’invitation', () => {
  const entry = createEntry({
    date: '2026-09-14',
    answers: answers(),
    context: contexte,
    recommendation: evaluateCheckin(answers(), contexte),
    now: '2026-09-14T06:45:00.000Z',
  });
  const t = text(semaine({ checkin: entry }));
  assert.ok(!t.includes('FAIRE LE POINT'), 'le questionnaire n’est pas redemandé');
  assert.match(t, /POINT DU JOUR/);
  assert.match(t, /MODIFIER/);
});

test('sans branchement, l’écran Semaine reste exactement ce qu’il était', () => {
  const t = text(semaine({ onOpenCheckin: undefined }));
  assert.ok(!t.includes('FAIRE LE POINT'));
  assert.ok(!t.includes('POINT DU JOUR'));
});

const fiche = (props = {}) => renderToStaticMarkup(createElement(SessionScreen, {
  session: { ...session, brief: 'Six exercices.', durationLabel: '60′' },
  onClose() {}, onAnalyse() {}, onOpenExercise() {}, onStartGuided() {},
  planningActions: {
    onValidate() {}, onMove() {}, onModify() {}, onReject() {}, onRestore() {}, onUndo() {},
  },
  dateOptions: [], canRestore: false, canUndo: false,
  checkin: null, onOpenCheckin() {},
  ...props,
}));

test('la fiche de la séance du jour donne accès au questionnaire', () => {
  const markup = fiche();
  assert.match(text(markup), /FAIRE LE POINT/);
  assert.match(markup, /<button/);
});

test('la fiche rappelle la recommandation quand le point est déjà fait', () => {
  const recommendation = evaluateCheckin(answers(), contexte);
  const entry = createEntry({
    date: '2026-09-14', answers: answers(), context: contexte, recommendation,
  });
  const t = text(fiche({ checkin: entry }));
  assert.match(t, new RegExp(STATUS_LABELS[recommendation.status]));
  assert.match(t, /VOIR LE POINT DU JOUR/);
});

test('une séance réalisée ne propose pas de faire le point après coup', () => {
  const t = text(fiche({ session: { ...session, done: true, status: 'RÉALISÉE' } }));
  assert.ok(!t.includes('FAIRE LE POINT'));
});

test('le déplacement demandé depuis le questionnaire ouvre le choix de date', () => {
  const t = text(fiche({
    initialAction: 'move',
    dateOptions: [{ date: '2026-09-16', sessions: [], availability: { available: true, durationMin: 60 }, compatibility: 'Recommandé', warnings: [] }],
    session: { ...session, planned: true, load: 24 },
  }));
  assert.match(t, /DÉPLACER LA SÉANCE/);
  assert.match(t, /CHOISIR UNE NOUVELLE DATE/);
});
