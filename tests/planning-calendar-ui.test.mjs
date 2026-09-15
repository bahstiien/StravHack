import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = resolve(import.meta.dirname, '..');

async function compile(entry) {
  const cache = join(root, '.cache');
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, 'calendar-ui-'));
  const outfile = join(dir, 'bundle.mjs');
  const sourcefile = join(root, entry);
  await build({
    absWorkingDir: root,
    stdin: { contents: readFileSync(sourcefile, 'utf8'), resolveDir: dirname(sourcefile), sourcefile, loader: 'jsx' },
    bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile,
    external: ['react', 'react-dom', 'react/jsx-runtime'], logLevel: 'silent',
  });
  const module = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  rmSync(dir, { recursive: true, force: true });
  return module;
}

const { default: PlanningScreen } = await compile('src/screens/PlanningScreen.jsx');
const { default: MonthView } = await compile('src/components/MonthView.jsx');
const { default: TrainingLogView } = await compile('src/components/TrainingLogView.jsx');
const { default: ProjectionView } = await compile('src/components/ProjectionView.jsx');
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ');

const sessions = [
  { id: 'a', date: '2026-09-05', type: 'TRAIL', title: 'Sortie longue', status: 'RÉALISÉE', done: true, load: 90, durationSec: 7200, dplus: 1200, rpe: 7, plannedLoad: 80 },
  { id: 'b', date: '2026-09-05', type: 'PPG', title: 'Gainage', status: 'PARTIELLE', load: 20, durationSec: 1800, pain: true, adaptation: 'Footing raccourci' },
  { id: 'c', date: '2026-09-08', type: 'TRAIL', title: 'Côtes', status: 'REFUSÉE', load: 45 },
];

test('l’espace Planning expose trois onglets accessibles', () => {
  const html = renderToStaticMarkup(createElement(PlanningScreen, {
    initialView: 'month', sessions, month: new Date(2026, 8, 1), onOpenSession() {},
  }));
  assert.match(html, /role="tablist"/);
  for (const label of ['SEMAINE', 'MOIS', 'CARNET']) assert.ok(text(html).includes(label));
  assert.match(html, /aria-selected="true"/);
});

test('le mois affiche plusieurs séances, objectif, bloc et commandes explicites', () => {
  const html = renderToStaticMarkup(createElement(MonthView, {
    month: new Date(2026, 8, 1), today: new Date(2026, 8, 5), sessions,
    goals: [{ id: 'g', date: '2026-09-20', title: 'Trail des Crêtes', priority: 'A' }],
    mountainBlocks: [{ id: 'm', startDate: '2026-09-05', endDate: '2026-09-06' }],
    conflicts: [{ id: 'x', date: '2026-09-08' }],
    stats: { plannedLoad: 220, completedLoad: 90, completedCount: 1, missedCount: 1, durationSec: 9000, distanceKm: 24, dplus: 1550, goalProgressPct: 62 },
    onPreviousMonth() {}, onNextMonth() {}, onCurrentMonth() {}, onSelectDay() {}, onOpenProjection() {},
  }));
  const t = text(html);
  for (const label of ['MOIS PRÉCÉDENT', 'MOIS SUIVANT', 'MOIS ACTUEL', '2 SÉANCES', 'OBJECTIF', 'BLOC MONTAGNE', 'CONFLIT', '220 UC', '1 550 m', 'VOIR LA PROJECTION']) assert.ok(t.includes(label), label);
  assert.match(html, /aria-current="date"/);
});

test('la grille d’octobre reste continue lors du changement d’heure', () => {
  const html = renderToStaticMarkup(createElement(MonthView, { month: new Date(2026, 9, 1), today: new Date(2026, 9, 25) }));
  const labels = [...html.matchAll(/aria-label="(\d+ octobre),/g)].map((match) => match[1]);
  assert.equal(labels.filter((label) => label === '25 octobre').length, 1);
  assert.ok(labels.includes('31 octobre'));
});

test('le carnet filtre et explique les écarts prévu/réalisé', () => {
  const html = renderToStaticMarkup(createElement(TrainingLogView, { sessions, initialFilter: 'changed', onOpenSession() {} }));
  const t = text(html);
  assert.match(html, /aria-label="Filtrer le carnet"/);
  for (const label of ['TOUTES', 'TRAIL', 'PPG', 'RÉALISÉES', 'MODIFIÉES OU MANQUÉES', 'PARTIELLE', 'REFUSÉE', 'Footing raccourci']) assert.ok(t.includes(label), label);
  assert.match(t, /10 UC de plus que prévu/);
});

test('la projection décrit les jalons sans graphique décoratif', () => {
  const html = renderToStaticMarkup(createElement(ProjectionView, {
    projection: { goal: { title: 'Trail des Crêtes', date: '2026-10-18' }, weeksRemaining: 5, currentPhase: 'Développement', weeks: [
      { id: 'w1', label: '21–27 sept.', kind: 'key', title: 'Semaine clé' },
      { id: 'w2', label: '28 sept.–4 oct.', kind: 'recovery', title: 'Assimilation' },
      { id: 'w3', label: '5–11 oct.', kind: 'taper', title: 'Début de l’affûtage' },
      { id: 'w4', label: '12–18 oct.', kind: 'race', title: 'Semaine de course' },
    ] }, onClose() {},
  }));
  const t = text(html);
  for (const label of ['5 SEMAINES', 'DÉVELOPPEMENT', 'Assimilation', 'Début de l’affûtage', 'Semaine de course']) assert.ok(t.includes(label), label);
});

test('les états vides et erreurs sont compréhensibles', () => {
  assert.match(text(renderToStaticMarkup(createElement(TrainingLogView, { sessions: [] }))), /Aucune séance/);
  assert.match(renderToStaticMarkup(createElement(MonthView, { error: 'Synchronisation impossible', month: new Date(2026, 8, 1) })), /role="alert"/);
});
