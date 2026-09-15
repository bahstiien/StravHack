import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const root = resolve(import.meta.dirname, '..');

async function compile(entry) {
  const cache = join(root, '.cache');
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, 'planning-ui-'));
  const outfile = join(dir, 'bundle.mjs');
  const sourcefile = join(root, entry);
  await build({
    absWorkingDir: root,
    stdin: { contents: readFileSync(sourcefile, 'utf8'), resolveDir: dirname(sourcefile), sourcefile, loader: 'jsx' },
    bundle: true, format: 'esm', platform: 'node',
    jsx: 'automatic', outfile, external: ['react', 'react-dom', 'react/jsx-runtime'],
    logLevel: 'silent',
  });
  const module = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  rmSync(dir, { recursive: true, force: true });
  return module;
}

const { default: PlanningActions } = await compile('src/components/PlanningActions.jsx');
const { default: AvailabilitySettings } = await compile('src/components/AvailabilitySettings.jsx');

const session = {
  id: 'planned-1', title: 'Côtes courtes', status: 'PROPOSÉE', date: '2026-09-14',
  durationMin: 55, time: '18:30', type: 'course', intensity: 'soutenue', distanceKm: 9,
  dplus: 350, repetitions: 8, ppgContent: '', comment: '', completed: false,
};

const callbacks = {
  onValidate() {}, onMove() {}, onModify() {}, onReject() {}, onRestore() {}, onUndo() {},
};

const text = (markup) => markup.replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ');
const renderActions = (props = {}) => renderToStaticMarkup(createElement(PlanningActions, {
  session, dateOptions: [], ...callbacks, ...props,
}));

test('les quatre décisions principales sont de vrais boutons accessibles', () => {
  const markup = renderActions();
  for (const label of ['VALIDER', 'DÉPLACER', 'MODIFIER', 'REFUSER']) {
    assert.match(markup, new RegExp(`<button[^>]*>${label}</button>`));
  }
  assert.ok(!/<div[^>]*onclick/i.test(markup));
  assert.match(markup, /aria-label="Actions sur la séance Côtes courtes"/);
});

test('une séance réalisée ne propose aucune altération rétroactive', () => {
  const t = text(renderActions({ session: { ...session, status: 'RÉALISÉE', completed: true } }));
  assert.ok(t.includes('Cette séance réalisée ne peut plus être modifiée'));
  for (const label of ['DÉPLACER', 'MODIFIER', 'REFUSER']) assert.ok(!t.includes(label));
});

test('le déplacement décrit disponibilités, conflits et confirmation possible', () => {
  const markup = renderActions({
    initialAction: 'move',
    dateOptions: [{
      date: '2026-09-17', label: 'JEUDI 17 SEPTEMBRE', sessions: ['PPG haut du corps'],
      availability: { available: true, durationMin: 90, equipment: ['haltères'] },
      compatibility: 'Recommandé', warnings: [],
    }, {
      date: '2026-09-16', label: 'MERCREDI 16 SEPTEMBRE', sessions: ['Séance club'],
      availability: { available: false, durationMin: 0, equipment: [] },
      compatibility: 'Attention', warnings: ['Récupération potentiellement insuffisante'],
    }],
  });
  const t = text(markup);
  assert.match(markup, /role="dialog"/);
  for (const expected of ['JEUDI 17 SEPTEMBRE', '90 min disponibles', 'haltères', 'Recommandé', 'PPG haut du corps', 'MERCREDI 16 SEPTEMBRE', 'Indisponible', 'Récupération potentiellement insuffisante', 'CONFIRMER LE DÉPLACEMENT']) {
    assert.ok(t.includes(expected), `contenu absent : ${expected}`);
  }
  assert.match(markup, /type="radio"/);
});

test('la modification expose tous les paramètres éditables et la restauration', () => {
  const markup = renderActions({ initialAction: 'modify', canRestore: true });
  const t = text(markup);
  for (const expected of ['Durée', 'Horaire indicatif', 'Type de séance', 'Intensité cible', 'Distance', 'Dénivelé positif', 'Répétitions ou blocs', 'Contenu PPG', 'Commentaire personnel', 'ENREGISTRER LES MODIFICATIONS', 'RESTAURER LA PROPOSITION']) {
    assert.ok(t.includes(expected), `champ absent : ${expected}`);
  }
  assert.match(markup, /aria-describedby="planning-modify-help"/);
});

test('le refus demande un motif facultatif et une stratégie explicite', () => {
  const t = text(renderActions({ initialAction: 'reject' }));
  for (const expected of ['REFUSER LA SÉANCE', 'Motif facultatif', 'Manque de temps', 'Douleur ou blessure', 'Supprimer uniquement cette séance', 'Chercher automatiquement un autre créneau', 'Proposer une séance plus courte', 'Remplacer par de la récupération ou de la mobilité', 'CONFIRMER LE REFUS']) {
    assert.ok(t.includes(expected), `option absente : ${expected}`);
  }
});

const weekly = Object.fromEntries(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].map((day) => [day, {
  available: true, durationMin: 60, slot: 'normal', canRun: true, canPpg: true,
  equipment: ['poids-du-corps'], preferredTime: '18:00', preference: 'aucune',
}]));

test('les disponibilités hebdomadaires couvrent les sept jours et tous les réglages', () => {
  const markup = renderToStaticMarkup(createElement(AvailabilitySettings, {
    weeklyAvailability: weekly, datedConstraints: [], onSaveWeekly() {}, onAddConstraint() {}, onRemoveConstraint() {},
  }));
  const t = text(markup);
  assert.ok(t.includes('MES DISPONIBILITÉS'));
  assert.equal((markup.match(/<fieldset/g) || []).length, 7);
  for (const expected of ['LUNDI', 'DIMANCHE', 'Durée maximale', 'Créneau', 'Course possible', 'PPG possible', 'Matériel accessible', 'Heure préférée', 'Préférence', 'ENREGISTRER MES DISPONIBILITÉS']) {
    assert.ok(t.includes(expected), `réglage absent : ${expected}`);
  }
});

test('les contraintes datées sont visibles, ajoutables et supprimables au clavier', () => {
  const markup = renderToStaticMarkup(createElement(AvailabilitySettings, {
    weeklyAvailability: weekly,
    datedConstraints: [{ id: 'c1', date: '2026-09-22', type: 'vacances', note: 'Séjour montagne' }],
    onSaveWeekly() {}, onAddConstraint() {}, onRemoveConstraint() {},
  }));
  const t = text(markup);
  for (const expected of ['CONTRAINTES EXCEPTIONNELLES', 'Une contrainte datée est prioritaire', '22 septembre 2026', 'Vacances', 'Séjour montagne', 'AJOUTER LA CONTRAINTE', 'SUPPRIMER']) {
    assert.ok(t.includes(expected), `contenu absent : ${expected}`);
  }
  assert.match(markup, /aria-label="Supprimer la contrainte Vacances du 22 septembre 2026"/);
});
