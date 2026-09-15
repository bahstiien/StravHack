// L'adaptation d'une séance, et son branchement sur le planning existant.
//
// L'adaptation ne touche à rien toute seule : elle produit une proposition —
// un avant, un après, ce qui est retiré, conservé, ajouté — et un jeu de
// modifications au format que `modifySession` sait déjà valider. C'est la
// confirmation de l'utilisateur qui transforme la proposition en décision.

import test from 'node:test';
import assert from 'node:assert/strict';

import { adaptSession, wodParamsFromCheckin } from '../src/data/checkin-adapt.js';
import { evaluateCheckin, STATUS } from '../src/data/checkin-engine.js';
import { normalizeAnswers } from '../src/data/checkin-model.js';
import { modifySession, validateSession } from '../src/data/planning-decisions.js';
import { applyDecisionLayer } from '../src/data/planning-conflicts.js';
import { validateWodParams, generateWod, parseConstraintZones } from '../src/data/wod.js';

const exercices = [
  { id: 'e1', cat: 'MOBILITÉ', target: 'hamstrings', name: 'Mobilité hanches', sets: '2 × 12', tempo: 'lent' },
  { id: 'e2', cat: 'FORCE', target: 'quads', name: 'Fente bulgare lestée', sets: '4 × 8', tempo: '3–1–1' },
  { id: 'e3', cat: 'FORCE', target: 'spine', name: 'Tirage élastique', sets: '4 × 12', tempo: '2–1–2' },
  { id: 'e4', cat: 'EXCENTRIQUE', target: 'calves', name: 'Mollets excentriques', sets: '3 × 12', tempo: '1–0–4' },
  { id: 'e5', cat: 'PLIOMÉTRIE', target: 'calves', name: 'Box jumps', sets: '5 × 8', tempo: 'contact court' },
  { id: 'e6', cat: 'GAINAGE', target: 'abs', name: 'Gainage latéral', sets: '3 × 45″', tempo: 'continu' },
  { id: 'e7', cat: 'MOBILITÉ', target: 'calves', name: 'Mobilité chevilles', sets: '2 × 12', tempo: 'lent' },
];

const ppgSession = (over = {}) => ({
  id: 'plan-2026-09-14', date: '2026-09-14', type: 'PPG', title: 'PPG jambes et pliométrie',
  planned: true, done: false, load: 24, durationSec: 3600, durationLabel: '60′',
  intensity: 'ppg', zone: 'FORCE · PLIO', status: 'PROPOSÉE',
  ppgExercises: exercices,
  steps: exercices.map((e, i) => ({ i: String(i + 1).padStart(2, '0'), label: e.name, detail: e.sets })),
  brief: 'Six exercices, soixante minutes.',
  ...over,
});

const trailSession = (over = {}) => ({
  id: 'plan-2026-09-14', date: '2026-09-14', type: 'TRAIL', title: '3 × 8′ au seuil',
  planned: true, done: false, load: 120, durationSec: 3600, durationLabel: '60′',
  intensity: 'quality', zone: 'Z4', status: 'PROPOSÉE',
  steps: [
    { i: '01', label: 'Échauffement', detail: '20′' },
    { i: '02', label: '3 × 8′', detail: 'seuil' },
    { i: '03', label: 'Retour au calme', detail: '10′' },
  ],
  ...over,
});

const context = (over = {}) => ({
  date: '2026-09-14',
  plannedSessionId: 'plan-2026-09-14',
  plannedTitle: 'PPG jambes et pliométrie',
  plannedType: 'PPG',
  plannedIntensity: 'ppg',
  plannedDurationMinutes: 60,
  plannedTargets: ['quadriceps', 'calves'],
  plannedHasPlyo: true,
  sessionLocked: false,
  sessionStatus: 'PROPOSÉE',
  freshness: 0, ratio: 0.8, recentLoad: 100, recentLoadBaseline: 120,
  restingHeartRate: 50, restingHeartRateBaseline: 51,
  clubInDays: 5, longRunInDays: 6, phase: 'développement', phaseLabel: 'Développement',
  hasCorosData: true,
  ...over,
});

const answers = (over = {}) => normalizeAnswers({
  availableMinutes: 60, fatigue: 2, sleepQuality: 4, motivation: 4,
  soreness: { level: 'none', areas: [] }, pain: { present: false },
  availableEquipment: ['poids-du-corps', 'halteres'], comment: '', ...over,
});

function propose(session, over = {}, ctxOver = {}) {
  const a = answers(over);
  const ctx = context(ctxOver);
  const recommendation = evaluateCheckin(a, ctx);
  return { recommendation, proposal: adaptSession(session, { answers: a, recommendation, context: ctx }) };
}

/* ── Quand il n’y a rien à adapter ──────────────────────────────────────── */

test('une journée favorable ne produit aucune adaptation', () => {
  const { recommendation, proposal } = propose(ppgSession());
  assert.equal(recommendation.status, STATUS.KEEP);
  assert.equal(proposal, null);
});

test('une séance réalisée n’est jamais adaptée', () => {
  const { proposal } = propose(
    ppgSession({ done: true, status: 'RÉALISÉE', activityId: 'a-1' }),
    { availableMinutes: 30 },
  );
  assert.equal(proposal, null);
});

test('une séance validée reçoit un avertissement mais reste verrouillée', () => {
  const { proposal } = propose(
    ppgSession({ status: 'VALIDÉE', locked: true }),
    { availableMinutes: 30, soreness: { level: 'heavy', areas: ['quadriceps'] } },
    { sessionLocked: true, sessionStatus: 'VALIDÉE' },
  );
  assert.ok(proposal, 'la proposition existe pour être affichée');
  assert.equal(proposal.applicable, false);
  assert.match(proposal.blockedReason, /validée/i);
});

/* ── Raccourcir ─────────────────────────────────────────────────────────── */

test('moins de temps : la séance est raccourcie et la différence est montrée', () => {
  const { proposal } = propose(ppgSession(), { availableMinutes: 40 });
  assert.ok(proposal.applicable);
  assert.equal(proposal.before.durationMin, 60);
  assert.equal(proposal.after.durationMin, 40);
  assert.ok(proposal.removed.length > 0, 'des exercices sont retirés');
  assert.ok(proposal.kept.length > 0, 'le bloc prioritaire est conservé');
  assert.equal(proposal.changes.durationMin, 40);
});

test('l’échauffement garde sa fonction même raccourci', () => {
  const { proposal } = propose(ppgSession(), { availableMinutes: 30 });
  const gardés = proposal.after.exercises.map((e) => e.cat);
  assert.ok(gardés.includes('MOBILITÉ'), 'la mise en route reste');
});

/* ── Substituer ─────────────────────────────────────────────────────────── */

test('des courbatures importantes retirent la pliométrie et l’exercice de la zone', () => {
  const { proposal } = propose(ppgSession(), {
    soreness: { level: 'heavy', areas: ['calves'] },
  });
  const noms = proposal.after.exercises.map((e) => e.name);
  assert.ok(!noms.includes('Box jumps'), 'la pliométrie est retirée');
  assert.ok(!noms.includes('Mollets excentriques'), 'la zone courbaturée n’est plus sollicitée en force');
  assert.ok(proposal.removed.includes('Box jumps'));
  assert.ok(noms.includes('Tirage élastique'), 'le haut du corps est conservé');
});

test('un mouvement déclaré douloureux n’est jamais proposé', () => {
  const { proposal } = propose(ppgSession(), {
    pain: { present: true, area: 'knees', intensity: 4, moments: ['movement'], triggers: ['fente bulgare'] },
  });
  const noms = proposal.after.exercises.map((e) => e.name.toLowerCase());
  assert.ok(!noms.some((n) => n.includes('fente bulgare')));
  assert.ok(proposal.removed.some((n) => /fente bulgare/i.test(n)));
});

test('une adaptation ajoute de la mobilité quand elle a vidé la séance de son travail', () => {
  const { proposal } = propose(ppgSession(), {
    availableMinutes: 30,
    soreness: { level: 'heavy', areas: ['quadriceps', 'calves'] },
  });
  assert.ok(proposal.added.length > 0);
  assert.ok(proposal.after.exercises.length >= 2, 'il reste une séance à faire');
});

test('l’adaptation ne mute pas la séance d’origine', () => {
  const session = ppgSession();
  const copie = structuredClone(session);
  propose(session, { availableMinutes: 30, soreness: { level: 'heavy', areas: ['calves'] } });
  assert.deepEqual(session, copie);
});

/* ── Course à pied ──────────────────────────────────────────────────────── */

test('une séance intense devient de l’endurance facile quand la récupération est dégradée', () => {
  const { proposal } = propose(
    trailSession(),
    { fatigue: 5, sleepQuality: 1 },
    { plannedType: 'TRAIL', plannedIntensity: 'quality', plannedTargets: ['quadriceps', 'calves'] },
  );
  assert.equal(proposal.changes.intensity, 'easy');
  assert.match(proposal.after.label, /facile|endurance/i);
  assert.ok(proposal.notes.some((n) => /intensité/i.test(n)));
});

test('la proposition de récupération remplace la séance par de la mobilité', () => {
  const { recommendation, proposal } = propose(
    trailSession(),
    {
      fatigue: 5, sleepQuality: 1, stress: 5, legs: 1,
      soreness: { level: 'heavy', areas: ['quadriceps'] },
    },
    { plannedType: 'TRAIL', plannedIntensity: 'quality', freshness: -45 },
  );
  assert.equal(recommendation.status, STATUS.RECOVER);
  assert.match(proposal.after.label, /récupération|mobilité/i);
  assert.equal(proposal.changes.type, 'REPOS');
});

test('une indisponibilité propose le déplacement et non une modification de contenu', () => {
  const { recommendation, proposal } = propose(ppgSession(), { availableMinutes: 0 });
  assert.equal(recommendation.status, STATUS.MOVE);
  assert.equal(proposal.mode, 'move');
  assert.equal(proposal.changes, null, 'rien à écrire dans la séance');
});

test('une douleur préoccupante ne produit aucune version modifiée de la séance', () => {
  const { recommendation, proposal } = propose(ppgSession(), {
    pain: { present: true, area: 'knees', intensity: 8, moments: ['rest'] },
  });
  assert.equal(recommendation.status, STATUS.MEDICAL);
  assert.equal(proposal.mode, 'medical');
  assert.equal(proposal.applicable, false);
  assert.equal(proposal.changes, null);
  assert.equal(proposal.after, null);
});

/* ── Le format lisible ──────────────────────────────────────────────────── */

test('la proposition se lit comme un avant / après', () => {
  const { proposal } = propose(ppgSession(), {
    availableMinutes: 40, soreness: { level: 'light', areas: ['calves'] },
  });
  assert.match(proposal.before.label, /60 min/);
  assert.match(proposal.after.label, /40 min/);
  assert.ok(Array.isArray(proposal.removed));
  assert.ok(Array.isArray(proposal.kept));
  assert.ok(Array.isArray(proposal.added));
});

/* ── Branchement sur le planning ────────────────────────────────────────── */

test('appliquer une adaptation passe par une décision « modifier » valide', () => {
  const session = ppgSession();
  const { proposal } = propose(session, { availableMinutes: 40 });
  const decision = modifySession(session, proposal.changes);
  assert.equal(decision.action, 'modify');
  assert.equal(decision.status, 'MODIFIÉE');

  const { sessions } = applyDecisionLayer([session], [decision], []);
  const adaptée = sessions.find((s) => s.id === session.id);
  assert.equal(adaptée.durationSec, 40 * 60);
  assert.equal(adaptée.status, 'MODIFIÉE');
  assert.equal(adaptée.locked, true);
  assert.ok(adaptée.load < 24 || adaptée.load === Math.round(24 * 40 / 60));
});

test('sans confirmation, la séance du planning n’est pas modifiée', () => {
  const session = ppgSession();
  propose(session, { availableMinutes: 20, soreness: { level: 'heavy', areas: ['quadriceps'] } });
  const { sessions } = applyDecisionLayer([session], [], []);
  const inchangée = sessions.find((s) => s.id === session.id);
  assert.equal(inchangée.durationSec, 3600);
  assert.equal(inchangée.status, 'PROPOSÉE');
  assert.equal(inchangée.title, 'PPG jambes et pliométrie');
});

test('une séance déjà validée n’est pas écrasée par l’adaptation', () => {
  const session = ppgSession();
  const validation = validateSession(session);
  const { proposal } = propose(
    session,
    { availableMinutes: 30 },
    { sessionLocked: true, sessionStatus: 'VALIDÉE' },
  );
  assert.equal(proposal.applicable, false);

  const { sessions } = applyDecisionLayer([session], [validation], []);
  const validée = sessions.find((s) => s.id === session.id);
  assert.equal(validée.status, 'VALIDÉE');
  assert.equal(validée.durationSec, 3600);
});

/* ── Alimentation du générateur PPG / WOD ───────────────────────────────── */

test('le générateur reçoit la durée, le matériel et les contraintes du jour', () => {
  const a = answers({
    availableMinutes: 30,
    availableEquipment: ['poids-du-corps', 'corde-a-sauter'],
    soreness: { level: 'heavy', areas: ['calves'] },
    pain: { present: true, area: 'knees', intensity: 4, moments: ['movement'], triggers: ['box jump'] },
    fatigue: 4,
  });
  const params = wodParamsFromCheckin({ seed: 3 }, a);
  assert.equal(params.durationMin, 30);
  assert.deepEqual(params.equipment.sort(), ['corde-a-sauter', 'poids-du-corps']);
  assert.match(params.constraints.pain, /genou/i);
  assert.match(params.constraints.avoid, /box jump/i);
  assert.match(params.constraints.avoid, /mollet/i);
  assert.equal(validateWodParams(params).ok, true);
});

test('la fatigue baisse l’ambition du WOD, jamais au point de le rendre invalide', () => {
  const params = wodParamsFromCheckin({}, answers({ fatigue: 5, motivation: 1, availableMinutes: 20 }));
  assert.equal(params.durationMin, 20);
  assert.equal(validateWodParams(params).ok, true);
  assert.ok(['mobilite', 'endurance', 'conditionnement'].includes(params.goal));
});

test('aucun mouvement incompatible avec une douleur déclarée n’est retenu', () => {
  const a = answers({
    availableMinutes: 30,
    pain: { present: true, area: 'knees', intensity: 5, moments: ['movement'], triggers: [] },
  });
  const params = wodParamsFromCheckin({ seed: 7 }, a);
  assert.ok(parseConstraintZones(params.constraints).includes('genou'));
  const res = generateWod(params);
  if (res.ok) {
    const noms = res.session.blocks.flatMap((b) => b.movements.map((m) => m.name.toLowerCase()));
    assert.ok(!noms.some((n) => /squat sauté|box jump|fente sautée/.test(n)));
  } else {
    assert.match(res.error, /contrainte|matériel/i);
  }
});

test('un matériel non disponible aujourd’hui n’est pas utilisé', () => {
  const params = wodParamsFromCheckin(
    { equipment: ['poids-du-corps', 'rameur', 'sled'] },
    answers({ availableEquipment: ['poids-du-corps'] }),
  );
  assert.deepEqual(params.equipment, ['poids-du-corps']);
});

test('sans réponse sur le matériel, celui des réglages est conservé', () => {
  const params = wodParamsFromCheckin(
    { equipment: ['poids-du-corps', 'halteres'] },
    answers({ availableEquipment: null }),
  );
  assert.deepEqual(params.equipment.sort(), ['halteres', 'poids-du-corps']);
});
